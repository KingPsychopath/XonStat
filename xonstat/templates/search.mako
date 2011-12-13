<%inherit file="base.mako"/>

% if results == None:
<form action="${request.route_url("search")}" method="get">
    <input type="hidden" name="form_submitted" />
    <table id="search_form" border="0">
        <tr>
            <td style="text-align:right;">Nick:</td>
            <td><input type="text" name="nick" /></td>
        </tr>
        <tr>
            <td style="text-align:right;">Server:</td>
            <td><input type="text" name="server_name" /></td>
        </tr>
        <tr>
            <td style="text-align:right;">Map:</td>
            <td><input type="text" name="map_name" /></td>
        </tr>
        <tr>
            <td style="text-align:right;"></td>
            <td><input type="submit" /></td>
        </tr>
    </table>
    </form>
% endif

##### player-only results #####
% if result_type == "player":
<table>
    <tr>
        <th>Player</th>
        <th>Joined</th>
    </tr>
    % for player in results:
    <tr>
        <td><a href="${request.route_url("player_info", id=player.player_id)}" name="Player info page for player #${player.player_id}">${player.nick_html_colors()|n}</a></td>
        <td>${player.joined_pretty_date()}</td>
    </tr>
    % endfor
</table>
% endif

##### server-only results #####
% if result_type == "server":
<table>
    <tr>
        <th>Server</th>
        <th>Created</th>
    </tr>
    % for server in results:
    <tr>
        <td><a href="${request.route_url("server_info", id=server.server_id)}" name="Server info page for server #${server.server_id}">${server.name}</a></td>
        <td>${server.create_dt.strftime('%m/%d/%Y at %I:%M %p')}</td>
    </tr>
    % endfor
</table>
% endif

##### map-only results #####
% if result_type == "map":
<table>
    <tr>
        <th>Map</th>
        <th>Created</th>
    </tr>
    % for map in results:
    <tr>
        <td><a href="${request.route_url("map_info", id=map.map_id)}" name="Map info page for map #${map.map_id}">${map.name}</a></td>
        <td>${map.create_dt.strftime('%m/%d/%Y at %I:%M %p')}</td>
    </tr>
    % endfor
</table>
% endif
