# Changelog

Notable changes to `ap-nimbus-app-manager` in each version.

## [2.1.0] - 2026-08-17

### Added

- An end-to-end simulation test (`test/simulation.test.js`) that posts a real
  simulation to a running container and asserts the voltage results and STDOUT
  fall within numeric tolerances.
- A `docker-test` CI workflow that builds the image, starts a container, runs
  the simulation test against it, and dumps the container logs on failure.
- Multi-architecture builds: the image is now published for `linux/amd64` and
  `linux/arm64` using the shared `docker/github-builder` reusable workflow.
- A declared Node.js `>=20` engine requirement.

### Changed

- `pacingFrequency` is now mandatory and is validated when the request arrives,
  rather than failing later in the run.
- The built-in ApPredict help text covers more of the supported options.
- Base image advanced to `cardiacmodelling/appredict-with-emulators:2.1.0`;
  version label and package version advanced to `2.1.0`.

### Fixed

- `--pacing-max-time` is no longer passed to ApPredict as the literal
  `undefined` when a request omits it. The flag is only added when a value was
  actually supplied.
- The "invalid operation" error message ran its words together and omitted
  `STDOUT` and `STDERR` from the list of valid query options.
- The `docker-test` workflow now triggers correctly on pushes to `master`.

### Removed

- The `uuid` dependency, replaced by Node's built-in `crypto.randomUUID`. The
  generated identifiers are still v4 UUIDs, so dependent functionality is
  unchanged.

## [2.0.0] - 2024-08-27

### Added

- A GitHub Action to build and publish the image.

### Changed

- Upgraded to Node 20 and refreshed the npm dependencies.
- Base image advanced to `cardiacmodelling/appredict-with-emulators:2.0.0`.
- Reworked npm cache handling and permissions.
- Updated the help text, copyright notices and license.

### Removed

- The `ip` package, which carried a known vulnerability.

## [1.0.1] - 2024-06-25

### Changed

- Security bumps: `braces` 3.0.2 → 3.0.3 and `ip` 1.1.8 → 1.1.9.

## [1.0.0] - 2023-07-21

### Changed

- Removed HTTP keep-alive from the server and adjusted the connection timeouts,
  to stop long-running simulations losing their connection.
- Tracked the rename of the ApPredict branch.

## [0.0.15] - 2022-12-12

### Added

- Python version information is now recorded in the simulation output.

### Changed

- Switched to the Debian buster based chaste-libs image and the CMake build.
- Updated npm and the `uuid` package.

### Removed

- The Jenkinsfile.

## [0.0.14] - 2022-09-09

First release from the standalone repository — `app-manager` was split out of
the AP-Nimbus umbrella repository, where its last state is tagged
`app-manager-0.0.13`.

### Changed

- Replaced the deprecated `requests` npm module with `tiny-json-http`.
- The shell scripts are made executable when the container starts.

[2.1.0]: https://github.com/CardiacModelling/ap-nimbus-app-manager/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/CardiacModelling/ap-nimbus-app-manager/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/CardiacModelling/ap-nimbus-app-manager/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CardiacModelling/ap-nimbus-app-manager/compare/0.0.15...v1.0.0
[0.0.15]: https://github.com/CardiacModelling/ap-nimbus-app-manager/compare/0.0.14...0.0.15
[0.0.14]: https://github.com/CardiacModelling/ap-nimbus-app-manager/releases/tag/0.0.14
