# OWCS Lab

OWCS Lab provides statistics for Overwatch esports players, teams, maps, tournaments, matches, and comparisons.

## Base URL

Use the URL where the API is hosted. The examples below use:

```text
http://owcslab.co.uk
```

## Endpoints

### Homepage

```http
GET /api/home
```

Returns match totals, player-stat totals, and the latest matches.

### Players

```http
GET /api/players
GET /api/players/filters
GET /api/players/:name
```

`/api/players` accepts player list filters such as tournament, stage, region, team, role, and circuit. Player detail requests can also use tournament filters.

### Teams

```http
GET /api/teams
GET /api/teams/:name
GET /api/compare/teams
```

Use the `circuit` query parameter with `/api/teams`, for example `?circuit=owcs` or `?circuit=owwc`.

### Maps

```http
GET /api/maps
GET /api/maps/:name
```

Map detail requests return ban statistics and team win-rate data. Tournament filters can be supplied as query parameters.

### Tournaments

```http
GET /api/tournaments
```

Tournament options can be scoped with identifiers such as `player`, `playerId`, `team`, `teamId`, or `map`.

### Team comparison

```http
GET /api/compare?teamA=TEAM_ID&teamB=TEAM_ID
```

Returns head-to-head results, match history, team totals, map comparisons, and ban statistics. Optional tournament filtering is supported with `tournaments` and `tournamentMode` query parameters.

## Query examples

```http
GET /api/players?role=Support&region=EMEA
GET /api/teams?circuit=owcs
GET /api/tournaments?teamId=12
GET /api/compare?teamA=12&teamB=34&tournaments=5,9&tournamentMode=include
```

## Responses

Successful requests return JSON. Errors return a JSON object containing an `error` message and an appropriate HTTP status code.
