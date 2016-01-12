<%inherit file="base.mako"/>

<%block name="title">
Leaderboard
</%block>

<%block name="css">
  ${parent.css()}
</%block>

<%block name="hero_unit">
<div class="text-center shadowtext" style="margin-top: 40px">
  <p id="statline">
    % if stat_line is None:
    Tracking Quake Live statistics since November 2015.
    % else:
    Tracking ${stat_line|n} since November 2015.
    % endif

    % if day_stat_line is not None:
    <br />${day_stat_line|n} in the past 24 hours.
    % endif
  </p>
</div>

<div class="row newsitem" style="background-color:#822;display:none">
  <div class="col-sm-2">
    2016-01-07 22:16 CET
  </div>
  <div class="col-sm-10">
    Duel ratings are being recalculated. ETA ~1.5h
    <br />CA, FFA, TDM, CTF and FT are already done.
  </div>
</div>

<div class="row newsitem">
  <div class="col-sm-2">
    2016-01-09 20:35 CET
  </div>
  <div class="col-sm-10">
    added 1-Flag CTF, A&D, DOM, Harvester, Race and RR <a href="/news#4490"> ...</a>
  </div>
</div>

<div class="row newsitem">
  <div class="col-sm-2">
    2016-01-06 21:00 CET
  </div>
  <div class="col-sm-10">
    added <a href="/news">News/Forum</a> (hosted by plusforward.net) with a <a href="/news#4488">Rating Q&A</a> thread
  </div>
</div>

</%block>

<%block name="js">
  ${parent.js()}

<script>
  var region=1;
  var gameType="duel";
  var dataCache={};

  function fillRanking(region, gameType) {
    $("#moreRanking").attr("href", "/ranks/" + gameType + "/" + region);

    if (dataCache.hasOwnProperty(gameType + region))
      fillTable();
    else {
      dataCache[gameType + region] = null;
      $.getJSON("/ranks/" + gameType + "/" + region + ".json", { limit: 10 }, function(data) {
        dataCache[gameType + region] = data;
        fillTable();
      })
      .fail(function(err) { console.log(err); });
    }

    function fillTable() {
      var data = dataCache[gameType + region] || { players: []};
      for (var i=1, c=data.players.length; i<=10; i++) {
        var player=data.players[i-1];
        var $row = $($("#rankingTable tr")[i]);
        var $cells = $row.children();
        $($cells[1]).html(i < c ? "<a href='/player/" + player.player_id + "'>" + player.html_name + "</a>" : "");
        $($cells[2]).html(i < c ? player.rating : "").attr("title", "\xb1 " + player.rd).css("cursor", "help");
      }
      $("#ratingSelection a").removeClass("selected");
      $("#ratingSelection a[data-region='" + region + "']").addClass("selected");
      $("#ratingSelection a[data-gt='" + gameType + "']").addClass("selected");
    }
  }

  $("#ratingSelection a").on("mouseover", function() {
    var r = $(this).data("region");
    if (r)
      region = r;
    else
      gameType = $(this).data("gt");
    fillRanking(region, gameType);
  });

  fillRanking(region, gameType);
</script>
</%block>

<div class="row">

  ##### RANKS #####
  <div class="col-sm-6 col-md-3">
    <h3>Player Ranking</h3>
    <div id="ratingSelection" style="float:left;width:50px">
      <a data-region="1">EU</a><br>
      <a data-region="5">NA</a><br>
      <a data-region="6">SA</a><br>
      <a data-region="4">AU</a><br>
      <a data-region="3">AS</a><br>
      <a data-region="2">AF</a><br>
      <br>
      <a data-gt="duel">Duel</a><br>
      <a data-gt="ca">CA</a><br>
      <a data-gt="ffa">FFA</a><br>
      <a data-gt="ctf">CTF</a><br>
      <a data-gt="tdm">TDM</a><br>
      <a data-gt="ft">FT</a>
    </div>
    <div style="overflow:hidden">
      <table id="rankingTable" class="table table-hover table-condensed" style="table-layout:fixed;width:100%">
        <thead>
          <tr>
            <th style="width:25px">#</th>
            <th>Player</th>
            <th style="width:50px">Glicko</th>
          </tr>
        </thead>
        <tbody>

          <% i = 1 %>
          % while i <= 10:
          <tr>
            <td>${i}</td>
            <td style="white-space:nowrap;overflow-x:hidden"></td>
            <td></td>
          </tr>
          <% i = i+1 %>
          % endwhile

        </tbody>
      </table>
      <p class="note"><a id="moreRanking" href="" title="See more rankings">More...</a></p>
    </div>
  </div> <!-- /span3 -->
  ##### ACTIVE MAPS #####
  <div class="col-sm-6 col-md-3 col-md-push-6">
    <h3>Most Active Maps</h3>
    <table class="table table-hover table-condensed">
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th style="width:180px;">Map</th>
          <th style="width:60px;">Games</th>
        </tr>
      </thead>
      <tbody>
        <% i = 1 %>
        % for (map_id, name, count) in top_maps:
        <tr>
          <td>${i}</td>
          % if map_id != '-':
          <td class="nostretch" style="max-width:180px;"><a href="${request.route_url('map_info', id=map_id)}" title="Go to the map info page for ${name}">${name}</a></td>
          % else:
          <td class="nostretch" style="max-width:180px;">${name}</td>
          % endif
          <td>${count}</td>
        </tr>
        <% i = i+1 %>
        % endfor
      </tbody>
    </table>
    <p class="note"><a href="${request.route_url('top_maps_by_times_played', page=1)}" title="See more map activity">More...</a></p>
  </div> <!-- /span4 -->
  ##### ACTIVE SERVERS #####
  <div class="col-sm-12 col-md-6 col-md-pull-3">
    <h3 style="display:inline-block">Most Active Servers</h3> <p class="note" style="display:inline-block">*Most active stats are from the past 7 days</p>
    <p style="position:absolute;right:15px;top:20px"><a class="btn btn-primary btn-small" href="http://qlstats.net:8081/servers.html">Add Server</a></p>
    <table class="table table-hover table-condensed">
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th style="width:40px;">Loc</th>
          <th style="width:250px;">Server</th>
          <th style="width:60px;">Games</th>
        </tr>
      </thead>
      <tbody>
        <% i = 1 %>
        % for (server_id, name, count, country_code, country_name) in top_servers:
        <tr>
          <td>${i}</td>
          <td>
            % if country_code is not None:
            <img src="/static/images/flags/${country_code.lower()}.png" alt="${country_name}" class="flag"> ${country_code}
            % endif
          </td>
          % if server_id != '-':
          <td class="nostretch" style="max-width:180px;"><a href="${request.route_url('server_info', id=server_id)}" title="Go to the server info page for ${name}">${name}</a></td>
          % else:
          <td class="nostretch" style="max-width:180px;">${name}</td>
          % endif
          <td>${count}</td>
        </tr>
        <% i = i+1 %>
        % endfor
      </tbody>
    </table>
    <p class="note"><a href="${request.route_url('top_servers_by_players', page=1)}" title="See more server activity">More...</a></p>
  </div> <!-- /span4 -->


</div> <!-- /row -->
##### RECENT GAMES #####
% if len(recent_games) > 0:
<div class="row">
  <div class="col-sm-12">
    <h3>Recent Games</h3>
    <table class="table table-hover table-condensed">
      <thead>
        <tr>
          <th></th>
          <th>Type</th>
          <th>Loc</th>
          <th>Server</th>
          <th>Map</th>
          <th>Time</th>
          <th>Winner</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        % for rg in recent_games:
        <tr>
          <td class="tdcenter"><a class="btn btn-primary btn-small" href="${request.route_url('game_info', id=rg.game_id)}" title="View detailed information about this game">view</a></td>
          <td><img src="/static/images/icons/24x24/${rg.game_type_cd}.png" alt="${rg.game_type_cd}" width="24" height="24"> ${rg.game_type_cd}</td>
          <td>
            % if rg.country is not None:
            <img src="/static/images/flags/${rg.country.lower()}.png" alt="${rg.country}" width="24" height="24" class="flag"> ${rg.country}
            % endif
          </td>
          <td><a href="${request.route_url('server_info', id=rg.server_id)}" title="Go to the detail page for this server">${rg.server_name}</a></td>
          <td><a href="${request.route_url('map_info', id=rg.map_id)}" title="Go to the map detail page for this map">${rg.map_name}</a></td>
          <td><span class="abstime" data-epoch="${rg.epoch}" title="${rg.start_dt.strftime('%a, %d %b %Y %H:%M:%S UTC')}">${rg.fuzzy_date}</span></td>
          <td class="nostretch">
            % if rg.player_id > 2:
            <a href="${request.route_url('player_info', id=rg.player_id)}" title="Go to the player info page for this player">${rg.nick_html_colors|n}</a>
          </td>
          % else:
          ${rg.nick_html_colors|n}</td>
          % endif
          <td>
            % if rg.score1 is not None:
            ${rg.score1}:${rg.score2}
            % endif
          </td>
        </tr>
        % endfor
      </tbody>
    </table>
    <p><a href="${request.route_url('game_index')}">More...</a></p>
  </div> <!-- /span12 -->
</div> <!-- /row -->
% endif
