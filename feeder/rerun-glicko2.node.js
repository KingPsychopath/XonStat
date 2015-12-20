﻿var
  fs = require("graceful-fs"),
  pg = require("pg"),
  zlib = require("zlib"),
  glicko2 = require("glicko2"),
  Q = require("q");


// TODO: turn this into command line args
var gametype = "ctf";
var resetRating = true;


var _config;
var g2 = new glicko2.Glicko2({ tau: 0.5, rating: 1500, rd: 300, vol: 0.06 });
var playersBySteamId = {};
var strategy;

// values for DB column games.g2_status
var
  ERR_NOTRATED = 0,
  ERR_OK = 1,
  ERR_ABORTED = 2,
  ERR_ROUND_OR_TIMELIMIT = 3,
  ERR_BOTMATCH = 4,
  ERR_TEAMTIMEDIFF = 5,
  ERR_MINPLAYERS = 6;

function main() {
  _config = JSON.parse(fs.readFileSync(__dirname + "/cfg.json"));

  //Q.longStackSupport = true;

  strategy = createGameTypeStrategy(gametype);

  dbConnect()
    .then(function (cli) {
      return resetRatingsInDb(cli)
        .then(function() { return getMatchIds(cli); })
        .then(function (matches) { return processMatches(cli, matches); })
        .then(function (results) { return saveResults(cli, results)})
        .then(printResults)
        .finally(function () { cli.release(); });
    })
    .catch(function (err) { console.log(err);
      throw err;
    })
    .finally(function () { pg.end(); })
    .done();
}

function createGameTypeStrategy(gametype) {
  var ValidFactoriesForGametype = {
    "duel": ["duel", "qcon_duel"],
    "ffa": ["ffa", "mg_ffa_classic"],
    "ca": ["ca", "capickup"],
    "tdm": ["ctdm", "qcon_tdm"],
    "ctf": ["ctf", "ctf2", "qcon_ctf"]
  }
  var MinRequiredPlayersForGametype = {
    "duel": 2,
    "ffa": 4,
    "ca": 8,
    "tdm": 8,
    "ctf": 8
  }
  var ValidateMatchForGametype = {
    "duel": function (json) { return json.matchStats.GAME_LENGTH >= 10 * 60 },
    "ffa": function (json) { return json.matchStats.FRAG_LIMIT >= 50 },
    "ca": function (json) { return Math.max(json.matchStats.TSCORE0, json.matchStats.TSCORE1) >= 10 /* old JSONS have no ROUND_LIMIT */ },
    "tdm": function (json) { return Math.max(json.matchStats.TSCORE0, json.matchStats.TSCORE1) >= 100 || json.matchStats.GAME_LENGTH >= 15 * 10 },
    "ctf": function (json) { return Math.max(json.matchStats.TSCORE0, json.matchStats.TSCORE1) >= 8 || json.matchStats.GAME_LENGTH >= 15 * 10 }
  }

  return {
    validFactories: ValidFactoriesForGametype[gametype],
    minPlayers: MinRequiredPlayersForGametype[gametype],
    validateGame: ValidateMatchForGametype[gametype],
    maxTeamTimeDiff: 10 * 60
  }
}

function dbConnect() {
  var defConnect = Q.defer();
  pg.connect(_config.webapi.database, function (err, cli, release) {
    if (err)
      defConnect.reject(new Error(err));
    else {
      cli.release = release;
      defConnect.resolve(cli);
    }
  });
  return defConnect.promise;
}

function resetRatingsInDb(cli) {
  if (!resetRating)
    return Q();

  return Q
    .ninvoke(cli, "query", { name: "g2_reset1", text: "update player_elos set g2_games=0, g2_r=1500, g2_rd=300, g2_vol=0.06 where game_type_cd=$1", values: [gametype] })
    .then(function () { return Q.ninvoke(cli, "query", { name: "g2_reset2", text: "update player_game_stats pgs set g2_score=null, g2_delta_r=null, g2_delta_rd=null from games g where pgs.game_id=g.game_id and g.game_type_cd=$1", values: [gametype] }) })
    .then(function() { return Q.ninvoke(cli, "query", "update games set g2_status=0") });
}

function getMatchIds(cli) {
  return Q.ninvoke(cli, "query", "select match_id, start_dt, game_id from games where game_type_cd='" + gametype + "' and mod in ('" + strategy.validFactories.join("','") + "') order by start_dt")
    .then(function (result) {
      return result.rows.map(function(row) { return { game_id: row["game_id"], date: row["start_dt"], match_id: row["match_id"] }; });
    });
}

function processMatches(cli, matches) {
  return matches.reduce(function (chain, match) {
    return chain.then(function () { return /* ok || */ processMatch(cli, match.match_id, match.date, match.game_id); });
  }, Q())
    .then(function () { return playersBySteamId; });
}

function processMatch(cli, matchId, date, gameId) {
  var deltas = [0, +1, -1];
  var subfolders = [];
  for (var i = 0; i < 3; i++)
    subfolders.push(getDateFolder(date, deltas[i]));
  subfolders.push("omega/");

  var file = null;
  for (var i = 0; i < subfolders.length; i++) {
    try {
      file = __dirname + "/" + _config.feeder.jsondir + subfolders[i] + matchId + ".json.gz";
      var stat = fs.statSync(file);
      if (stat && stat.isFile())
        break;
      file = null;
    } 
    catch (err) {
    }
  }

  if (file) {
    return processFile(cli, gameId, file)
      .catch(function (err) {
        console.log("Failed to process " + file + ": " + err);
        //throw err;
        return false;
      });
  }

  console.log("json.gz not found: " + matchId);
  return false;
}

function getDateFolder(date, deltaDays) {
  var newDate;
  if (deltaDays) {
    newDate = new Date(date.getTime());
    newDate.setDate(newDate.getDate() + deltaDays);
  }
  else
    newDate = date;

  var year = newDate.getUTCFullYear();
  var month = newDate.getUTCMonth();
  var day = newDate.getUTCDate();
  return year + "-" + ("0" + (month + 1)).substr(-2) + "/" + ("0" + day).substr(-2) + "/";
}

function processFile(cli, gameId, file) {
  return extractDataFromJson(file)
    .then(function (result) {    
      // store a status code why the game was not rated
      if (typeof (result) === "number")
        return setGameStatus(result).then(Q(false));

      var playerRanking = result;
      var matches = [];
      var players = [];
      for (var i = 0; i < playerRanking.length; i++) {
        var r1 = playerRanking[i];
        var p1 = playersBySteamId[r1.id];
        p1.score = Math.round(r1.score);
        players.push(p1);
        ++p1.games;
        if (r1.win)
          ++p1.wins;
        p1.rating.oldR = p1.rating.getRating();
        p1.rating.oldRd = p1.rating.getRd();

        for (var j = i + 1; j < playerRanking.length; j++) {
          var r2 = playerRanking[j];
          var p2 = playersBySteamId[r2.id];
          var result = r1.score > r2.score ? 1 : r1.score < r2.score ? 0 : 0.5;
          matches.push([p1.rating, p2.rating, result]);
        }
      }

      g2.updateRatings(matches);

      return savePlayerGameRatingChange(players)
        .then(function() { return setGameStatus(ERR_OK) })
        .then(Q(true));
    });

  function savePlayerGameRatingChange(players) {
    return players.reduce(function (chain, p) {
      return chain.then(function () {
        return getPlayerId(cli, p)
          .then(function (pid) {
            var val = [gameId, pid, p.score, p.rating.getRating() - p.rating.oldR, p.rating.getRd() - p.rating.oldRd];
            return Q.ninvoke(cli, "query", { name: "pgs_upd", text: "update player_game_stats set g2_score=$3, g2_delta_r=$4, g2_delta_rd=$5 where game_id=$1 and player_id=$2", values: val })
              .then(function (result) {
                if (result.rowCount == 0)
                  console.log("player_game_stats not found: gid=" + gameId + ", pid=" + pid);
                return Q();
              });
          });
      });
    }, Q());
  }

  function setGameStatus(status) {
    return Q.ninvoke(cli, "query", { name: "game_upd", text: "update games set g2_status=$2 where game_id=$1", values: [gameId, status] })
      .then(function () { return false; });
  }

}

function extractDataFromJson(path) {
  return Q
    .nfcall(fs.readFile, path)
    .then(function(data) { return Q.nfcall(zlib.gunzip, data); })
    .then(function(json) {
      var raw = JSON.parse(json);

      if (raw.matchStats.ABORTED) return ERR_ABORTED;
      if (!strategy.validateGame(raw)) return ERR_ROUND_OR_TIMELIMIT;

      // aggregate total time, damage and score of player during a match (could have been switching teams)
      var playerData = {}
      var botmatch = false;
      var timeRed = 0, timeBlue = 0;
      raw.playerStats.forEach(function (p) {
        botmatch |= p.STEAM_ID == "0";
        if (p.WARMUP || botmatch) // p.ABORTED must be counted for team switchers
          return;

        var pd = playerData[p.STEAM_ID];
        if (!pd) {
          pd = { id: p.STEAM_ID, name: p.NAME, timeRed: 0, timeBlue: 0, score: 0, dg: 0, dt: 0, win: false };
          playerData[p.STEAM_ID] = pd;
        }

        var time = Math.min(p.PLAY_TIME, raw.matchStats.GAME_LENGTH);
        if (p.TEAM == 2) {
          timeBlue += time;
          pd.timeBlue += time;
        }
        else {
          timeRed += time;
          pd.timeRed += time;
        }
        pd.score += p.SCORE;
        pd.dg += p.DAMAGE.DEALT;
        pd.dt += p.DAMAGE.TAKEN;
        if (p.RANK == 1)
          pd.win = true;
      });

      if (botmatch)
        return ERR_BOTMATCH;
      if (timeBlue != 0 && Math.abs(timeRed - timeBlue) > strategy.maxTeamTimeDiff) {
        //console.log(raw.matchStats.MATCH_GUID + ": timeRed=" + timeRed + ", timeBlue=" + timeBlue);
        return ERR_TEAMTIMEDIFF;
      }

      // calculate a rankingScore for each player
      var players = [];
      for (var steamId in playerData) {
        if (!playerData.hasOwnProperty(steamId)) continue;
        var pd = playerData[steamId];
        if (pd.timeRed + pd.timeBlue < raw.matchStats.GAME_LENGTH / 2)
          continue;

        if (!playersBySteamId[pd.id])
          playersBySteamId[pd.id] = { id: pd.id, name: pd.name, games: 0, wins: 0, rating: g2.makePlayer() };

        if (raw.matchStats.hasOwnProperty("TSCORE0")) {
          var winningTeam = raw.matchStats.TSCORE0 > raw.matchStats.TSCORE1 ? -1 : raw.matchStats.TSCORE0 == raw.matchStats.TSCORE1 ? 0 : +1;
          var playerTeam = pd.timeRed >= pd.timeBlue ? -1 : +1;
          pd.win = playerTeam == winningTeam;
        }

        var rankingScore = calcPlayerPerformance(pd, raw);
        players.push({ id: pd.id, score: rankingScore, win: pd.win });
      }

      return players.length < strategy.minPlayers ? ERR_MINPLAYERS : players;
    });
}

function calcPlayerPerformance(p, raw) {
  if (gametype == "ctf")
    return (p.dt == 0 ? 2 : Math.min(2, Math.max(0.5, p.dg / p.dt))) * (p.score + p.dg / 20) * raw.matchStats.GAME_LENGTH / (p.timeRed + p.timeBlue) + (p.win ? 300 : 0);

  return p.score;
}

function saveResults(cli, players) {
  var list = [];
  for (var steamId in players) {
    if (!players.hasOwnProperty(steamId)) continue;
    var player = players[steamId];
    if (player.games)
      list.push(player);
  }

  return list.reduce(function(chain, player) {
    return chain.then(function () {
      var val = [player.id, gametype, player.games, player.rating.getRating(), player.rating.getRd(), player.rating.getVol()];
      // try update and if rowcount is 0, execute an insert
      return Q.ninvoke(cli, "query", { name: "elo_upd", text: "update player_elos e set g2_games=$3, g2_r=$4, g2_rd=$5, g2_vol=$6 from hashkeys k where k.player_id=e.player_id and k.hashkey=$1 and e.game_type_cd=$2", values: val })
        .then(function(result) {
          if (result.rowCount == 1) return Q();

          return getPlayerId(cli, player)
            .then(function(pid) {
              if (!pid) return null;
              val[0] = pid;
              return Q.ninvoke(cli, "query", { name: "elo_ins", text: "insert into player_elos (player_id, game_type_cd, g2_games, g2_r, g2_rd, g2_vol, elo) values ($1,$2,$3,$4,$5,$6, 100)", values: val });
            });
        });
    });
  }, Q())
  .then(function () { return players; });
}

function getPlayerId(cli, player) {
  if (player.pid)
    return Q(player.pid);

  return Q.ninvoke(cli, "query", { name: "player_by_steamid", text: "select player_id from hashkeys where hashkey=$1", values: [player.id] })
    .then(function (result) {
      if (result.rows.length == 0) {
        console.log("no player with steam-id " + player.id);
        return null;
      }
      return player.pid = result.rows[0].player_id;
    });
}

function printResults() {
  var players = [];
  for (var key in playersBySteamId) {
    if (!playersBySteamId.hasOwnProperty(key)) continue;
    var p = playersBySteamId[key];
    players.push(p);
  }
  players.sort(function (a, b) {
    a = a.rating;
    b = b.rating;
    var c = a.getRating() - b.getRating();
    if (c == 0) c = a.getRd() - b.getRd();
    if (c == 0) c = a.getVol() - b.getVol();
    return -c;
  });
  players.forEach(function (p) {
    if (p.games < 10) return;
    console.log(p.name
      + ", r=" + Math.round(p.rating.getRating())
      + " (rd=" + Math.round(p.rating.getRd())
      + ", vol=" + round3(p.rating.getVol())
      + "), games: " + p.games
      + ", wins: " + Math.round(p.wins * 1000 / p.games) / 10 + "%");
  });

  return playersBySteamId;

  function round3(n) { return Math.round(n * 1000) / 1000; }
}

main();