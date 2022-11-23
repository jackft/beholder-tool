import * as PIXI from 'pixi.js';
import { ViewableBuffer } from 'pixi.js';
import * as c from './controller';
import { ChannelState } from './state';

const W = 1000;
const H = 500;

export const controller = new c.Controller({
    timeline_canvas: {
	    view: document.getElementById("timeline-canvas") as HTMLCanvasElement,
	    resolution: window.devicePixelRatio || 1,
	    autoDensity: true,
	    backgroundColor: 0x2c2c32,
	    width: W,
	    height: H
    },
    summary_canvas: {
	    view: document.getElementById("summary-canvas") as HTMLCanvasElement,
	    resolution: window.devicePixelRatio || 1,
	    autoDensity: true,
	    backgroundColor: 0x2c2c32,
	    width: W,
	    height: 50
    },
    timeline: {
        milliseconds: 10000
    }
});

const cstate: ChannelState = {
    id: 0,
    parentId:  null,
    name: "blah",
    allowedAnnotationIds: []
};

controller.createChannel(cstate);
const cstate2: ChannelState = {
    id: 1,
    parentId:  null,
    name: "blah",
    allowedAnnotationIds: []
};
controller.createChannel(cstate2);
const cstate3: ChannelState = {
    id: 2,
    parentId:  null,
    name: "blah",
    allowedAnnotationIds: []
};
controller.createChannel(cstate3);
const cstate4: ChannelState = {
    id: 3,
    parentId:  null,
    name: "blah",
    allowedAnnotationIds: []
};
controller.createChannel(cstate4);
for (let i = 0; i < 4000; ++i) {
    const s = Math.random()*10000;
    const w = Math.random()*10;
    const state = {
        id: i,
        channelId: Math.min(Math.floor(i / 1000), 3),
        type: "interval",
        value: "hi",
        startFrame: 0,
        endFrame: 0,
        startTime: s,
        endTime: s + w,
        modifiers: []
    };
    controller.createTimelineAnnotation(state, false);
}

//const cursor = controller.timeline.viewport.addChild(new PIXI.Graphics());
//cursor.lineStyle(10, 0xFF0000).drawRect(0, 0, controller.timeline.viewport.worldWidth, controller.timeline.viewport.worldHeight);
//cursor.interactive = true;
