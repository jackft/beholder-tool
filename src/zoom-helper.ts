import { Svg, on, off, Box, Matrix, Point } from '@svgdotjs/svg.js';
import { transform } from 'typescript';

// reimplementing svg.panzoom.js here
export enum MouseButton {
  left = 0,
  middle,
  right,
  back,
  forth
};

interface marginOptions {
  left: number
  top: number
  right: number
  bottom: number
}

interface zoomHelperOption {
    panning?: boolean
    pinchZoom?: boolean
    wheelZoom?: boolean
    panButton?: MouseButton
    oneFingerPan?: boolean
    margins?: marginOptions
    zoomCoefficient?: [number, number]
    zoomMin?: number
    zoomMax?: number
    wheelZoomDeltaModeLinePixels?: number
    wheelZoomDeltaModeScreenPixels?: number
};

interface Touch {
    clientX: number
    clientY: number
}

function normalizeEvent(event: MouseEvent): [number, number] {
    return [event.clientX, event.clientY];
}


interface ZoomEvents {
    "zoomHelper.zoom": Array<() => void>,
    "zoomHelper.pan": Array<() => void>,
}

export class ZoomHelper {
    svg: Svg

    zoomInProgress: boolean
    zoomFactor: number
    mouseDownP: [number, number]
    lastP: [number, number]
    scale: [number, number]
    translate: [number, number]
    original: Box

    disabled: boolean = false
    doPanning: boolean
    doWheelZoom: boolean
    panButton: MouseButton
    oneFingerPan: boolean
    margins?: marginOptions
    zoomCoefficient: [number, number]
    zoomMin: number
    zoomMax: number

    events: ZoomEvents;

    constructor(svg: Svg, options: zoomHelperOption) {
        this.svg = svg;

        this.mouseDownP = [0, 0];
        this.lastP = [0, 0];

        this.zoomInProgress = false;
        this.zoomFactor = 0;
        this.scale = [1, 1];
        this.translate = [0, 0];

        this.original = new Box(this.svg.viewbox());

        this.doPanning = options.panning ?? true;
        this.doWheelZoom= options.wheelZoom ?? true;
        this.panButton = options.panButton ?? 0;
        this.oneFingerPan = options.oneFingerPan ?? true;
        this.margins = options.margins ?? {left: 0, right: 300, top: 0, bottom: 300};
        this.zoomCoefficient = options.zoomCoefficient ?? [1.02, 1];
        this.zoomMin = options.zoomMin ?? -10;
        this.zoomMax = options.zoomMax ?? 0;

        this.events = {
            "zoomHelper.zoom": [],
            "zoomHelper.pan": [],
        };

        this.enable();
    }

    addEventListener(name, handler) {
        this.events[name].push(handler);
    }

    removeEventListener(name, handler) {
        if (!this.events.hasOwnProperty(name)) return;
        const index = this.events[name].indexOf(handler);
        if (index != -1)
            this.events[name].splice(index, 1);
    }

    disable() {
        this.disabled = true;
        this.svg.off("mousedown.panZoom");
        this.svg.off("wheel.panZoom");
    }

    enable() {
        this.disabled = false;
        if (this.doPanning) {
            // @ts-ignore
            this.svg.on("mousedown.panZoom", (event) => this.panStart(event), this.svg);
        }
        const _this = this;
        if (this.doWheelZoom) {
            // @ts-ignore
            this.svg.on("wheel.panZoom", (event) => this.wheelZoom(event), this.svg);
        }
    }

    resize() {
        this.original.x = 0;
        this.original.y = 0;
        // @ts-ignore
        this.original.width = this.svg.width();
        // @ts-ignore
        this.original.height = this.svg.height();
    }

    keepInBounds() {
        if (this.margins === undefined) return;
        const { top, left, bottom, right } = this.margins;
        let [x, y] = this.translate;
        const [zx, zy] = this.scale;
        if (x < 0) {
            x = 0;
        }
        else if (this.original.width < (x + this.original.width * zx)) {
            x = this.original.width - (this.original.width * zx);
        }
        //
        if (y < 0) {
            y = 0;
        }
        else if (this.original.height < (y + this.original.height * zy)) {
            y = this.original.height - (this.original.height * zy);
        }
        this.translate = [x, y];
    }

    transform() {
        this.keepInBounds();
        const box = new Box(this.original).transform(
            new Matrix().scale(...this.scale).translate(...this.translate)
        );
        this.svg.viewbox(box)
    }

    panStart(event: MouseEvent) {
        event.preventDefault();
        this.mouseDownP = normalizeEvent(event);
        this.lastP = [...this.translate];
        on(document, "mousemove.panZoom", ((event: MouseEvent) => this.panning(event)) as any);
        on(document, "mouseup.panZoom", ((event: MouseEvent) => this.panStop(event)) as any);
    }

    panning(event: MouseEvent) {
        event.preventDefault();
        const currentP = normalizeEvent(event);
        // get the difference between the down and current point
        const xDelta = this.mouseDownP[0] - currentP[0];
        const yDelta = this.mouseDownP[1] - currentP[1];
        // get new translation values
        let xNew = this.lastP[0] + xDelta * this.scale[0];
        let yNew = this.lastP[1] + yDelta * this.scale[1];
        this.translate = [xNew, yNew]
        this.transform();
        this.events["zoomHelper.pan"].forEach(f => f());
    }

    panStop(event: MouseEvent) {
        event.preventDefault();
        off(document, "mousemove.panZoom");
        off(document, "mouseup.panZoom");
    }

    wheelZoom(event: WheelEvent) {
        event.preventDefault();

        const [xOld, yOld] = this.translate;
        const [zxOld, zyOld] = this.scale;
        // figure our if we are zooming in, out, or not at all
        switch (Math.sign(event.deltaY)) {
            case 0:
                return;
                break;
            case 1:
                this.zoomFactor = Math.min(this.zoomFactor + 1, this.zoomMax);
                break;
            case -1:
                this.zoomFactor = Math.min(this.zoomFactor - 1, this.zoomMin);
                break;
            default:
                console.log("something went wrong setting the zoom level");
                break;
        }
        // get new zoom level
        const zxNew = this.zoomCoefficient[0]**this.zoomFactor;
        const zyNew = this.zoomCoefficient[1]**this.zoomFactor;


        const [xMouse, yMouse] = normalizeEvent(event);
        const {x, y} = this.svg.point(xMouse, yMouse);

        // Drived from the equation (x_p - x_v) / z_t == (x_p - ?) / z_{t+1}
        // where x_p is the center point, x_v is the old viewport translation
        // and z_t and z_{t+1} are the old and new zoom levels
        const xNew = x - (x - xOld) * (zxNew / zxOld);
        const yNew = y - (y - yOld) * (zyNew / zyOld);

        this.scale = [zxNew, zyNew];
        this.translate = [xNew, yNew];

        this.transform();

        this.events["zoomHelper.zoom"].forEach(f => f());
    }
}
