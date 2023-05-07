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

## Debugging with kepler.gl locally

1. checkout kepler.gl repo
2. run following commands in kepler.gl repo

```bash
CXXFLAGS="--std=c++14" yarn install

npm link # make sure package name is same as in dekart

yarn build

rm -rf ./node_modules/redux 
rm -rf ./node_modules/react
rm -rf ./node_modules/react-dom 
rm -rf ./node_modules/react-redux 
```
3. run `npm link @dekart-xyz/kepler.gl` commands in dekart repo

4. run `fswatch -o ./src | xargs -n1 -I{} yarn build` in kepler.gl repo to watch changes and rebuild kepler.gl; `fswatch` is specific to mac, you can use other tools for different OS

5. run `npm start` in dekart repo