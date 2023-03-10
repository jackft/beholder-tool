build:
	npm install
	npm run build
	npx webpack

watch-browser:
	npx webpack --watch

test:
	npm run test

lint:
	npm run lint

clean:
	rm -rf dist node_modules