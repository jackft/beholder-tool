export function inJestTest() {
    return typeof process !== "undefined" && process.env.JEST_WORKER_ID !== undefined;
}

export function deepCopy(o: Object) {return JSON.parse(JSON.stringify(o))}

export function pruneKeys(object: Object, keySubSet: Array<PropertyKey>) {
    return keySubSet.reduce((accObj, key) => {
        if (object.hasOwnProperty(key)) {
            accObj[key] = object[key];
        }
        return accObj;
    }, {});
};

export class CachedLoader {

    cache: {[key: string]: Object}

    constructor() {
        this.cache = {};
    }

    async load(uri: string) {
        if (uri in this.cache) return this.cache[uri];
        return await fetch(uri)
            .then(response => {
                if (!response.ok) {
                    throw new Error("HTTP error " + response.status);
                }
                return response.json();
            })
            .then(peaks => {
                console.log('loaded peaks! sample_rate: ' + peaks.sample_rate);
                return peaks
            })
            .catch((e) => {
                console.error('error', e);
            });
    }
}
