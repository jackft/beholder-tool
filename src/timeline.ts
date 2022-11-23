import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { Cull } from '@pixi-essentials/cull';

import IntervalTree from 'node-interval-tree';

import * as state from './state';
import { Scale, LinearScale } from './scales';
import { ParticleContainer, Sprite } from 'pixi.js';


interface TimelineLike {
    xscale: Scale
    textContainer: PIXI.Container

    addChild(child: PIXI.DisplayObject): PIXI.DisplayObject
    width(): number
    height(): number
    leftInView(): number
    rightInView(): number
    widthInView(): number
    zoomFactor(): number
}

interface TimelinOptions {
    summary_canvas: PIXI.IApplicationOptions,
    timeline_canvas: PIXI.IApplicationOptions,
    timeline: {
        milliseconds: number
    }
}

export class Timeline implements TimelineLike{
    // definitional attributes
    public channels: Array<Channel>
    public annotations: {[key: number]: TimelineAnnotation}
    public summary: Summary
    public ruler: Ruler

    // helper attributes
    public xscale: LinearScale;
    public draggingTimelineAnnotation: TimelineAnnotation | null = null;
    public selectedTimelineAnnotation: TimelineAnnotation | null = null;
    public hoveredTimelineAnnotation: TimelineAnnotation | null = null;
    private mouseDownX: number = -1;
    private mouseDownY: number = -1;
    private targetMouseDownX: number = -1;
    private targetMouseDownY: number = -1;

    // view attributes
    public timelineApp: PIXI.Application
    public renderer: PIXI.Renderer | PIXI.AbstractRenderer
    public viewport: Viewport
    public channelContainer: PIXI.Container
    public dragContainer: PIXI.Container
    public annotationContainer: PIXI.ParticleContainer
    public textContainer: PIXI.Container
    private cull: Cull


    private cullDirty: boolean;

    constructor(opts: TimelinOptions) {

        // helper attributes
        this.xscale = new LinearScale([0, 1000], [0, 10000]);

        // view attributes
        this.timelineApp = new PIXI.Application(opts.timeline_canvas);
        this.renderer = this.timelineApp.renderer;
        this.viewport = new Viewport({
            screenWidth: 1000,
            screenHeight: 500,
            worldWidth: 1000,
            worldHeight: 500,
            interaction: this.timelineApp.renderer.plugins.interaction // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
        }).drag({direction: 'x', mouseButtons: 'all'})
          .pinch({axis: 'x'})
          .wheel({axis: 'x'})
          .clamp({direction: 'x'})
	      .clampZoom({minScale: 1});

        this.dragContainer = new PIXI.Container();
        this.channelContainer = new PIXI.Container();
        this.annotationContainer = new PIXI.ParticleContainer(50000,{
            scale: true,
            position: true,
            rotation: true,
            uvs: true,
            alpha: true
        });
        this.annotationContainer.width = 1000;
        this.annotationContainer.height = 500;
        this.textContainer = new PIXI.Container();

        this.cull = new Cull().addAll(this.viewport.children);
        this.cullDirty = false;

        this.timelineApp.stage.addChild(this.viewport);
        this.viewport.addChild(this.channelContainer);
        this.viewport.addChild(this.annotationContainer);
        this.viewport.addChild(this.dragContainer);
        this.viewport.addChild(this.textContainer);


        this.timelineApp.stage.interactive = true;
        this.dragContainer.interactive = true;
        this.annotationContainer.interactive = true;

        // definitional attributes
        this.channels = [];
        this.annotations = {};
        this.ruler = new Ruler(this);
        this.summary = new Summary(new PIXI.Application(opts.summary_canvas), this);

        this._bindEvents();
    }

    _bindEvents() {
        this.viewport.on("zoomed", this._onZoomed, this);
        this.viewport.on("moved", this._onMoved, this);
        this.viewport.on("frame-end", this._onFrameEnd, this);
        this.viewport.on("pointerdown", this._onPointerDown, this);
        this.viewport.on("pointermove", this._onPointerMove, this);
        this.viewport.on("pointerup", this._onPointerUp, this);
    }
    _onZoomed() {
        if (this.selectedTimelineAnnotation !== null) {
            this.selectedTimelineAnnotation.zoomScale(this.viewport.scale.x);
        }
    }
    _onMoved() {
        this.ruler.update(this.viewport.scale.x);
        this.summary.update();
    }
    _onFrameEnd() {
        // needed for fast zoom & pan
        if (this.viewport.dirty || this.cullDirty) {
            this.cull.cull(this.renderer.screen);
            this.viewport.dirty = false;
            this.cullDirty = false;
        }
    }
    _onPointerDown(event: PIXI.InteractionEvent) {
        this.mouseDownX = this._rectifyX(event.data.global.x);
        this.mouseDownY = event.data.global.y;
        const annotations = this.findTimelineAnnotations(this.mouseDownX, this.mouseDownY);
        if (annotations.length == 0) return;
        if (this.selectedTimelineAnnotation !== null && this.selectedTimelineAnnotation.state.id !== annotations[0].state.id) {
            this.selectedTimelineAnnotation.deselect();
        }
        this.selectedTimelineAnnotation = annotations[0].select();
        this.draggingTimelineAnnotation = this.selectedTimelineAnnotation;
        this.targetMouseDownX = this.selectedTimelineAnnotation.x();
        this.targetMouseDownY = this.selectedTimelineAnnotation.y();
        this.viewport.drag(undefined);
    }
    _onPointerMove(event: PIXI.InteractionEvent) {
        const x = this._rectifyX(event.data.global.x);
        const y = event.data.global.y;
        const annotations = this.findTimelineAnnotations(x, y);
        this._onDrag(x, y, annotations);
        this._onHover(x, y, annotations);
    }
    _onDrag(x: number, y: number, annotations: TimelineAnnotation[]) {
        if (this.draggingTimelineAnnotation === null || this.draggingTimelineAnnotation.boundDragging) return;
        this.draggingTimelineAnnotation.drag(
            this.targetMouseDownX + x - this.mouseDownX,
            this.targetMouseDownY + y - this.mouseDownY
        );
        const channel = this.findChannel(x, y);
        if (channel === undefined) return;
        if (channel.state.id !== this.draggingTimelineAnnotation.state.id) {
            this.draggingTimelineAnnotation.changeChannel(channel);
        }
    }
    _onHover(x: number, y: number, annotations: TimelineAnnotation[]) {
        if (annotations.length === 0) {
            if (this.hoveredTimelineAnnotation?.state?.id !== this.selectedTimelineAnnotation?.state?.id) {
                this.hoveredTimelineAnnotation?.unhover();
            }
            this.hoveredTimelineAnnotation = null;
            return;
        }
        // make sure to unhover an annotation which is no longer hovered over
        if (annotations[0].state.id !== this.hoveredTimelineAnnotation?.state?.id) {
            this.hoveredTimelineAnnotation?.unhover();
        }
        // don't set the new annotation hover new if its selected. Selected takes priority over hover
        if (annotations[0].state.id !== this.selectedTimelineAnnotation?.state?.id) {
            this.hoveredTimelineAnnotation = annotations[0].hover();
        }
    }
    _onPointerUp(event: PIXI.InteractionEvent) {
        this.viewport.drag({direction: 'x', mouseButtons: 'all'});
        if (this.selectedTimelineAnnotation !== null) {
            this.selectedTimelineAnnotation._pointerUp(event);
        }
        if (this.draggingTimelineAnnotation === null) return;
        const x = this._rectifyX(event.data.global.x);
        const y = event.data.global.y;
        this.draggingTimelineAnnotation = null;
    }

    _rectifyX(x: number) {
        return this.viewport.left + x / this.viewport.scale.x;
    }

    // timeline like
    addChild(child: PIXI.DisplayObject): PIXI.DisplayObject {
        return this.viewport.addChild(child);
    }

    leftInView() {return this.viewport.left}
    rightInView() {return this.viewport.right}
    widthInView() {return this.rightInView() - this.leftInView()}
    zoomFactor() {return this.viewport.scale.x}
    width() {return this.viewport.width}
    height() {return this.viewport.height}

    //

    findTimelineAnnotations(x: number, y: number): TimelineAnnotation[] {
        const channel = this.findChannel(x, y);
        if (channel === undefined) return [];
        return channel.findTimelineAnnotations(x, y);
    }

    findChannel(x: number, y: number): Channel | undefined {
        return this.channels.find((channel: Channel) => {
            return channel.top <= y && y <= channel.bottom
        });
    }

    findChannelById(id: number): Channel | undefined {
        return this.channels.find((channel: Channel) => {
            return channel.state.id === id;
        });
    }

    //
    createChannel(state: state.ChannelState) {
        const channel = new Channel(state, this);
        this.channels.push(channel);
        if (channel.bottom > +this.timelineApp.view.style.height) {
            this.timelineApp.view.style.height = `${Math.max(...this.channels.map(channel => channel.bottom))}`;
        }
    }
    createTimelineAnnotation(state: state.TimelineAnnotationState) {
        const channel = this.findChannelById(state.channelId);
        if (channel === undefined) return;
        const annotation = channel.addAnnotation(state);
        this.annotations[state.id] = annotation;
        this.summary.add(state);
    }
    deleteTimelineAnnotation(state: state.TimelineAnnotationState) {
        const channel = this.findChannelById(state.channelId);
        if (channel === undefined) return;
        //channel.removeAnnotation(state);
    }

}

export class Summary implements TimelineLike {
    // definitional attributes
    public app: PIXI.Application
    public timeline: Timeline
    public ruler: Ruler
    public xscale: Scale
    // view
    private annotationContainer: PIXI.ParticleContainer
    private tickContainer: PIXI.ParticleContainer
    public textContainer: PIXI.Container
    private window: PIXI.Graphics
    private border: PIXI.Graphics
    private annotations: {[key: number]: PIXI.Sprite}
    constructor(app: PIXI.Application, timeline: Timeline) {
        this.app = app;
        this.timeline = timeline;
        this.xscale = timeline.xscale;
        // view
        this.annotationContainer = new PIXI.ParticleContainer(50000, {
            scale: false,
            position: true,
            rotation: false,
            uvs: false,
            alpha: true
        });
        this.app.stage.addChild(this.annotationContainer);
        this.tickContainer = new PIXI.ParticleContainer(1000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: false
        });
        this.tickContainer.width = 1000;
        this.tickContainer.height = 500;
        this.app.stage.addChild(this.tickContainer);
        this.tickContainer.interactive = false;
        this.tickContainer.interactiveChildren = false;
        this.textContainer = new PIXI.Container();
        this.app.stage.addChild(this.textContainer);

        this.window = new PIXI.Graphics();
        this.border = new PIXI.Graphics();
        this.ruler = new Ruler(this);
        this.annotations = {};
        this.initView();
    }

    initView() {
        this.window
            .beginFill(0xffffff)
            .drawRect(
                this.timeline.leftInView(),
                0,
                this.timeline.rightInView(),
                this.height()
            );
        this.window.alpha = 0.5;
        this.app.stage.addChild(this.window);
        this.border.position.set(0, this.height());
        this.border.lineStyle(4, 0x212121).moveTo(0, 0).lineTo(this.width(), 0);
        this.app.stage.addChild(this.border);
        this.draw();
    }
    draw() {
        this.window.x = this.timeline.viewport.left;
        this.window.width = Math.max(1, this.timeline.widthInView());
    }
    update() {
        this.draw();
    }
    add(annotation: state.TimelineAnnotationState) {
        const annotationMarker = PIXI.Sprite.from(PIXI.Texture.WHITE);
        const start = this.timeline.xscale.inv(annotation.startTime);
        const end = this.timeline.xscale.inv(annotation.endTime);
        annotationMarker.x = start;
        annotationMarker.y = this.height() / 2;
        annotationMarker.width = end - start;
        annotationMarker.height = this.app.stage.height / 4;
        annotationMarker.alpha = 0.1;
        this.annotationContainer.addChild(annotationMarker);
        this.annotations[annotation.id] = annotationMarker;
    }
    remove(annotation: state.TimelineAnnotationState) {
        this.annotations[annotation.id].destroy();
        delete this.annotations[annotation.id];
    }

    // timeline like
    addChild(child: PIXI.DisplayObject): PIXI.DisplayObject {
        return this.app.stage.addChild(child);
    }
    width() {return this.app.view.width}
    height() {return this.app.view.height}
    leftInView() {return 0}
    rightInView() {return this.width()}
    widthInView() {return this.width()}
    zoomFactor() {return 1}
}


const timescales = [
    new LinearScale([0, 1000], [0, 1000], {name: "milliseconds", warn: false}),
    new LinearScale([0, 1000], [0, 500], {name: "halfcentiseconds", warn: false}),
    new LinearScale([0, 1000], [0, 100], {name: "centiseconds", warn: false}),
    new LinearScale([0, 1000], [0, 50], {name: "halfdeciseconds", warn: false}),
    new LinearScale([0, 1000], [0, 10], {name: "deciseconds", warn: false}),
    new LinearScale([0, 1000], [0, 2], {name: "halfseconds", warn: false}),
    new LinearScale([0, 1000], [0, 1], {name: "seconds", warn: false}),
    new LinearScale([0, 1000], [0, 1/5], {name: "5seconds", warn: false}),
    new LinearScale([0, 1000], [0, 1/10], {name: "decaseconds", warn: false}),
    new LinearScale([0, 1000], [0, 1/30], {name: "30seconds", warn: false}),
    new LinearScale([0, 1000], [0, 1/60], {name: "minutes", warn: false}),
    new LinearScale([0, 1000], [0, 1/300], {name: "5minutes", warn: false}),
    new LinearScale([0, 1000], [0, 1/600], {name: "10minutes", warn: false}),
];

export class Ruler {
    // definitional attributes
    public timeline: TimelineLike
    public scale: Scale
    // helper attributes
    public y: number
    public height: number
    public bottom: number

    private leftMostTick: PIXI.Sprite;
    private rightMostTick: PIXI.Sprite;
    // view
    private tickContainer: PIXI.ParticleContainer
    private border: PIXI.Graphics
    public ticks: Array<PIXI.Sprite>
    public labels: Array<PIXI.Text>

    constructor(timeline: TimelineLike) {
        this.timeline = timeline;
        this.scale = this.findBestScale();
        this.ticks = [];
        this.labels = [];
        //
        this.y = 0;
        this.height = 25;
        this.bottom = this.y + this.height;
        this.rightMostTick = this.leftMostTick = PIXI.Sprite.from(PIXI.Texture.WHITE);

        // view
        this.tickContainer = new PIXI.ParticleContainer(50000,{
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: false
        });
        this.tickContainer.width = 1000;
        this.tickContainer.height = 500;
        this.timeline.addChild(this.tickContainer);
        this.tickContainer.interactive = false;
        this.tickContainer.interactiveChildren = false;

        this.border = new PIXI.Graphics();
        this.initView();
    }

    findBestScale(): LinearScale {
        const targetTickWidth = 10;
        const minTickWidth = 3;
        let leastError = Number.MAX_VALUE;
        let bestScale = timescales[0];
        timescales.forEach(timescale => {
            const tickWidth = this.timeline.xscale.inv(timescale.inv(1)) * this.timeline.zoomFactor();
            const error = Math.abs(targetTickWidth - tickWidth);
            if (error < leastError && minTickWidth < tickWidth) {
                leastError = error;
                bestScale = timescale;
            }
        });
        return bestScale;
    }

    left() {
        return this.timeline.leftInView();
    }
    right() {
        return this.timeline.rightInView();
    }
    width() {
        return this.right() - this.left();
    }

    // view
    initView() {
        //this.timeline.channelContainer.addChild(this.border);
        this.update(1);
    }

    draw() {
        this.border.position.set(0, this.bottom);
        this.border.lineStyle(1, 0x919191).moveTo(0, 0).lineTo(this.width(), 0);
        const start = Math.max(this.left() - this.width(), 0);
        console.log(start);
        const end = Math.min(this.right() + this.width(), this.timeline.width());
        const tickWidth = this.timeline.xscale.inv(this.scale.inv(1));
        let i = 0;
        let j = 0;
        for (let x = start; x <= end; x += tickWidth) {
            const tickRank = Math.floor(x / tickWidth);
            i += this._createTicker(i, x, tickRank);
            j += this._createLabel(j, x, tickRank);
        }
        this.leftMostTick = this.ticks[0];
        this.rightMostTick = this.ticks[i - 1];
        for (;i < this.ticks.length; ++i) {
            this.ticks[i].x = -100
        }
        for (;j < this.labels.length; ++j) {
            this.labels[j].x = -100
        }
    }

    _createTicker(i: number, x: number, tickRank: number): number {
        const sprite: PIXI.Sprite = i < this.ticks.length
                                  ? this.ticks[i]
                                  : PIXI.Sprite.from(PIXI.Texture.WHITE);
        sprite.tint = 0x919191;
        sprite.width = 1;
        sprite.y = 0;
        sprite.x = x;
        if (tickRank % 10 == 0) {
            sprite.height = this.height / 2;
        } else if (tickRank % 5 == 0) {
            sprite.height = this.height / 4;
        } else {
            sprite.height = this.height / 8;
        }
        if (this.ticks.length <= i) {
            this.ticks.push(sprite);
            this.tickContainer.addChild(sprite);
        }
        return 1;
    }

    _createLabel(i: number, x: number, tickRank: number): number {
        if (tickRank % 10 !== 0) return 0;
        if (i > 0 && x <= this.labels[i - 1].x + this.labels[i - 1].width) return 0;
        const label = i < this.labels.length
                    ? this.labels[i]
                    : new PIXI.Text();
        label.text = new Date(this.timeline.xscale.call(Math.floor(x))).toISOString().slice(11,23);
        label.style = {
            fill: 0x919191,
            stroke: 0x919191,
            fontSize: 10,
            fontFamily: "Inconsolata; mono",
        }
        label.x = x;
        label.y = 10;
        label.anchor.set(0);
        if (this.labels.length <= i) {
            this.labels.push(label);
            this.timeline.textContainer.addChild(label);
        }
        return 1;
    }


    update(xScale: number) {
        const scale = this.findBestScale();
        if (!(scale.name === this.scale.name && this.leftMostTick.x <= this.timeline.leftInView() && this.timeline.rightInView() <= this.rightMostTick.x)) {
            this.scale = scale;
            this.draw();
        }
        this.ticks.forEach(tick => tick.width = 1/xScale);
        this.labels.forEach(label => label.scale.x = 1/xScale);
    }
}

export class Channel {
    //
    public state: state.ChannelState
    //
    private timelineAnnotationTree: IntervalTree<state.TimelineAnnotationState>

    // 
    private timeline: Timeline
    public left: number = 0
    public right: number = 0
    public top: number
    public bottom: number
    public width: number
    public height: number

    // view
    private border: PIXI.Graphics

    constructor(state: state.ChannelState, timeline: Timeline) {
        //
        this.state = state;
        //
        this.timelineAnnotationTree = new IntervalTree();

        //
        this.timeline = timeline;
        this.width = this.timeline.timelineApp.screen.width;
        this.height = 100;
        this.top = Math.max(this.timeline.ruler.bottom, Math.max(...this.timeline.channels.map(channel => channel.bottom)));
        this.bottom = this.top + this.height;

        // view
        this.border = new PIXI.Graphics();
        this.initView();
    }

    //
    _onResize() {
        this.draw();
    }

    //

    findTimelineAnnotations(x: number, y: number): TimelineAnnotation[] {
        return this.timelineAnnotationTree.search(x, x).map(state => this.timeline.annotations[state.id]);
    }

    // state
    addAnnotation(state: state.TimelineAnnotationState): TimelineAnnotation {
        const annotation = new TimelineAnnotation(state, this.timeline, this);
        this.insertAnnotation(annotation);
        return annotation;
    }
    insertAnnotation(annotation: TimelineAnnotation): boolean {
        return this.timelineAnnotationTree.insert(annotation.start(), annotation.end(), annotation.state);
    }
    removeAnnotation(annotation: TimelineAnnotation): boolean {
        return this.timelineAnnotationTree.remove(annotation.start(), annotation.end(), annotation.state);
    }

    // view
    initView() {
        this.timeline.channelContainer.addChild(this.border);
        this.draw();
    }
    draw() {
        this.border.position.set(0, this.bottom);
        this.border.lineStyle(1, 0x919191).moveTo(0, 0).lineTo(this.width, 0);
    }

}

export class TimelineAnnotation {
    // definitional attributes
    public state: state.TimelineAnnotationState
    public timeline: Timeline;
    public channel: Channel;

    // helper attributes
    private mouseDownX: number = -1
    private targetMouseDownX: number = -1
    public boundDragging: boolean = false
    private target: PIXI.Sprite | null = null
    private over: boolean = false

    private margin: number = 3;

    // view
    private sprite: PIXI.Sprite
    private left: PIXI.Sprite | null = null
    private right: PIXI.Sprite | null = null

    constructor(state: state.TimelineAnnotationState, timeline: Timeline, channel: Channel) {
        this.state = state;
        this.timeline = timeline;
        this.channel = channel;

        // view
        this.sprite = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.initView();
    }

    _pointerDown(event: PIXI.InteractionEvent) {
        this.boundDragging = true;
        this.mouseDownX = this.timeline._rectifyX(event.data.global.x);
        if (this.left !== null && event.target === this.left) {
            this.targetMouseDownX = this.left.x;
            this.target = this.left;
        } else if (this.right !== null && event.target === this.right) {
            this.targetMouseDownX = this.right.x;
            this.target = this.right;
        }
    }
    _pointerMove(event: PIXI.InteractionEvent) {
        const x = this.timeline._rectifyX(event.data.global.x);
        if (this.boundDragging) {
            this.channel.removeAnnotation(this);
            if (this.left !== null && this.target === this.left) {
                this.state.startTime = this.timeline.xscale.call(this.targetMouseDownX + x - this.mouseDownX);
                this.sprite.width = this.timeline.xscale.inv(this.state.endTime - this.state.startTime);
                this.left.x = this.sprite.x = this.timeline.xscale.inv(this.state.startTime);
            } else if (this.right !== null && this.target === this.right) {
                this.state.endTime = this.timeline.xscale.call(this.targetMouseDownX + x - this.mouseDownX);
                this.sprite.width = this.timeline.xscale.inv(this.state.endTime - this.state.startTime);
                this.right.x = this.end();
            }
            this.channel.insertAnnotation(this);
        }
    }
    _pointerUp(event: PIXI.InteractionEvent) {
        this.boundDragging = false;
        this.target = null;
    }
    _pointerOver(event: PIXI.InteractionEvent) {
        this.over = true;
        this.zoomScale(this.timeline.viewport.scale.x);
    }
    _pointerOut(event: PIXI.InteractionEvent) {
        this.over = false;
        this.zoomScale(this.timeline.viewport.scale.x);
    }

    //

    x() {return this.sprite.x}
    y() {return this.sprite.y}
    width() {return this.sprite.width}
    start() {return this.sprite.x;}
    end() {return this.sprite.x + this.sprite.width;}

    drag(x: number, y: number) {
        this.channel.removeAnnotation(this);
        this.sprite.x = x;
        const diff = this.timeline.xscale.call(x) - this.state.startTime;
        this.state.endTime += diff;
        this.state.startTime += diff;
        this.channel.insertAnnotation(this);
        if (this.left !== null) {
            this.left.x = this.start();
            this.left.y = this.y() + this.margin;
        }
        if (this.right !== null) {
            this.right.x = this.end();
            this.right.y = this.y() + this.margin;
        }
    }
    dragend() {
    }

    select() {
        this.sprite.tint = 0xff0000;
        if (this.left === null) {
            this.left = PIXI.Sprite.from(PIXI.Texture.WHITE);
            this.left.tint = 0xaaaaaa;
            this.left.height = 100 - 2*this.margin;
            this.left.y = this.y();
            this.left.x = this.start();
            this.left.interactive = true;
            this.left.zIndex = 100;
            this.left.on("pointerdown", this._pointerDown, this);
            this.left.on("pointermove", this._pointerMove, this);
            this.left.on("pointerup", this._pointerUp, this);
            this.left.on("pointerover", this._pointerOver, this);
            this.left.on("pointerout", this._pointerOut, this);
            this.timeline.dragContainer.addChild(this.left);
        }
        if (this.right === null) {
            this.right = PIXI.Sprite.from(PIXI.Texture.WHITE);
            this.right.tint = 0xaaaaaa;
            this.right.height = 100 - 2*this.margin;
            this.right.y = this.y();
            this.right.x = this.end();
            this.right.interactive = true;
            this.right.zIndex = 100;
            this.right.on("pointerdown", this._pointerDown, this);
            this.right.on("pointermove", this._pointerMove, this);
            this.right.on("pointerup", this._pointerUp, this);
            this.right.on("pointerover", this._pointerOver, this);
            this.right.on("pointerout", this._pointerOut, this);
            this.timeline.dragContainer.addChild(this.right);
        }
        this.zoomScale(this.timeline.viewport.scale.x);
        return this;
    }

    deselect() {
        this.sprite.tint = 0xffffff;
        this.left?.destroy();
        this.right?.destroy();
        this.left = null;
        this.right = null;
        return this;
    }

    hover() {
        this.sprite.tint = 0xcc7777;
        return this;
    }

    unhover() {
        this.sprite.tint = 0xffffff;
        return this;
    }

    changeChannel(channel: Channel) {
        this.channel.removeAnnotation(this);
        this.channel = channel;
        this.channel.insertAnnotation(this);
        this.sprite.y = this.channel.top + this.margin;
        if (this.left !== null) {
            this.left.y = this.y();
        }
        if (this.right !== null) {
            this.right.y = this.y();
        }
    }

    // view
    initView() {
        this.draw();
        this.timeline.annotationContainer.addChild(this.sprite);
    }
    draw() {
        this.sprite.x = this.timeline.xscale.inv(this.state.startTime);
        this.sprite.y = this.channel.top + this.margin;
        this.sprite.width = this.timeline.xscale.inv(this.state.endTime - this.state.startTime);
        this.sprite.height = 100 - 2*this.margin;
        this.sprite.tint = 0xffffff;
    }
    zoomScale(xScale: number) {
        const width = (this.over ? 4 : 1)/xScale;
        if (this.left !== null) {
            this.left.width = width;
        }
        if (this.right !== null) {
            this.right.width = width;
            this.right.x = this.end() - width;
        }
    }
}
