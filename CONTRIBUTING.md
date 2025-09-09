# Contributing guidelines

## Release process

1. Create a new branch for the release, e.g. `release-1.2`
2. Create a new release candidate using the command `make preminor` (or `make prepatch` or `make premajor` depending on the type of release)
3. Then push code and tags using the command `make release`
4. Test release candidate
5. If everything is ok, create a new release using the command `make minor` (or `make patch` or `make major` depending on the type of release)
6. Then push code and tags using the command `make release`
7. Update documentation
8. Create PR for the main branch
9. Create a new release on GitHub

## Getting dev Google Auth refresh token

1. Go to https://developers.google.com/oauthplayground/
2. Click on the gear icon (⚙️) in the top right corner and check 'Use your own OAuth credentials'.
4. Make to allowed URI is set to `https://developers.google.com/oauthplayground` for the OAuth 2.0 Client IDs
3. Use following scopes `https://www.googleapis.com/auth/bigquery,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/devstorage.read_write`
3. Click Authorize APIs
4. Use refresh token to as `DEKART_DEV_REFRESH_TOKEN`

## Running prev version via docker-compose

```
docker compose  --env-file .env.bigquery --profile dekart-oss-bigquery up
docker compose  --profile dekart-oss-bigquery down
```

## Generating GIFs from videos for screencasts

To convert video files to optimized GIFs for documentation:

```bash
ffmpeg -i input.mp4 -an \
  -filter_complex "[0:v]setpts=0.5*PTS,fps=15,scale=iw/2:ih/2:flags=lanczos,format=rgb24,split[s0][s1];\
                   [s0]palettegen=max_colors=256[p];\
                   [s1][p]paletteuse=dither=sierra2_4a" \
  -loop 0 output.gif
```

