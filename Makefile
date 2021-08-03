build:
	npm run build
	npx webpack

watch-browser:
	npx webpack --watch

test:
	npm run test

lint:
	npm run lint

clean:
	rm -rf bundles
	rm -rf lib
	rm -rf node_modules
