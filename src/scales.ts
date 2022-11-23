interface ScaleOptions {
    warn?: boolean,
    name?: String
}

const defaultOptions: ScaleOptions =  {
    warn: false,
    name: undefined
}

export interface Scale {
    name: String | undefined
    call(x: number): number
    inv(y: number): number
}

export class LinearScale implements Scale {

    warn: boolean
    name: String | undefined
    domain: [number, number]
    range: [number, number]
    offset: number
    intercept: number
    scale: number

    constructor(domain: [number, number], range: [number, number], opts: ScaleOptions = defaultOptions) {
        this.warn = opts.warn === undefined ? false : opts.warn;
        this.name = opts.name;
        this.domain = domain;
        this.range = range;
        this.offset = - domain[0];
        this.intercept = range[0];
        this.scale = (range[1] - range[0])/(domain[1] - domain[0]);
    }

    call(x: number): number {
        if ((x < this.domain[0] || this.domain[1] < x) && this.warn) {
            console.warn(`${x} outside domain ${this.domain}!`);
        }
        return this.scale*(x + this.offset) + this.intercept;
    }

    inv(y: number): number {
        if ((y < this.range[0] || this.range[1] < y) && this.warn) {
            console.warn(`${y} outside range ${this.range}!`);
        }
        return ((y - this.intercept)/this.scale) - this.offset;
    }
}
