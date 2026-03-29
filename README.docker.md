# Docker

## [Video](<https://www.youtube.com/watch?v=YnQWBLxPoO8>)

## Installation
	$ docker pull sigscale/ocs
	$ docker run -ti --entrypoint bash -h host1 -v db:/home/otp/db sigscale/ocs
	otp@host1:~$ bin/initialize
	otp@host1:~$ exit
	$ docker run -ti -h host1 -v db:/home/otp/db -p 8080:8080/tcp -p 1812:1812/udp -p 1813:1813/udp -p 3868:3868/tcp sigscale/ocs

## Session Debug Logs

Detailed session tracing logs can be enabled by adding
`{session_debug_logs, true}` to the `ocs` application section of `sys.config`.

When enabled, the following events appear in `docker logs`:

- `DIAMETER Ro session request`
- `DIAMETER Ro session result`
- `DIAMETER Ro debit normalization`
- `OCS session trace`
- `OCS stale session cleanup`

The default is `false`.

## Support
Contact <support@sigscale.com> for further assistance.
