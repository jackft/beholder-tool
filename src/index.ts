import * as PIXI from 'pixi.js';
import { ViewableBuffer } from 'pixi.js';
import * as c from './controller';
import { ChannelState } from './state';
import $ from 'jquery';
import {TabulatorFull as Tabulator} from 'tabulator-tables';

const W = 1000;
const H = 500;

// @ts-ignore
const controller = new c.Controller(document.getElementById("controller"), {
    timeline_canvas: {
	    view: document.getElementById("timeline-canvas") as HTMLCanvasElement,
	    resolution: window.devicePixelRatio || 1,
	    autoDensity: true,
	    backgroundColor: 0x1e1e1e,
	    width: W,
	    height: H
    },
    summary_canvas: {
	    view: document.getElementById("summary-canvas") as HTMLCanvasElement,
	    resolution: window.devicePixelRatio || 1,
	    autoDensity: true,
	    backgroundColor: 0x1e1e1e,
	    width: W,
	    height: 50
    },
    timeline: {
        milliseconds: 10000
    },
    table: {
        element: "#example-table",

    },
    media: {
        element: document.querySelector("#container"),
        src: "./video.mp4"
    }
});

const cstatewf: ChannelState = {
    id: -2,
    parentId:  null,
    name: "blah",
    background: "./waveform.png",
    showBackground: true,
    allowedAnnotationIds: []
};
controller.createChannel(cstatewf);

const cstate0: ChannelState = {
    id: -1,
    parentId:  null,
    name: "blah",
    background: "./spectrogram.png",
    showBackground: true,
    allowedAnnotationIds: []
};
controller.createChannel(cstate0);

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
const cstate5: ChannelState = {
    id: 4,
    parentId:  null,
    name: "blah",
    allowedAnnotationIds: []
};
controller.createChannel(cstate5);
const states = [];
for (let i = 0; i < 1000; ++i) {
    const s = Math.random()*2000000;
    const w = Math.random()*30000;
    const state = {
        id: i,
        channelId: Math.min(Math.floor(i / 200), 3),
        type: "interval",
        value: "hi",
        startFrame: 0,
        endFrame: 0,
        startTime: s,
        endTime: s + w,
        modifiers: []
    };
    // @ts-ignore
    states.push(state);
}
controller.batchCreateTimelineAnnotations(states);

//const cursor = controller.timeline.viewport.addChild(new PIXI.Graphics());
//cursor.lineStyle(10, 0xFF0000).drawRect(0, 0, controller.timeline.viewport.worldWidth, controller.timeline.viewport.worldHeight);
//cursor.interactive = true;

// var tabledata = Object.values(controller.timeline.annotations).map(annotation => {
//    return {
//        id: annotation.state.id,
//        startTime: annotation.state.startTime,
//        endTime: annotation.state.endTime,
//        channel: annotation.channel.state.name,
//        value: annotation.state.value,
//    }
// });
//var table = new Tabulator("#example-table", {
// 	height:400, // set height of table (in CSS or here), this enables the Virtual DOM and improves render speed dramatically (can be any valid css height value)
//    rowHeight: 40,
// 	data:tabledata, //assign data to table
// 	layout:"fitColumns", //fit columns to width of table (optional)
// 	columns:[ //Define Table Columns
//	 	{title:"Start Time", field:"startTime", formatter: timeFormatter},
//	 	{title:"End Time", field:"endTime", hozAlign:"left", formatter: timeFormatter},
//	 	{title:"channel", field:"channel"},
//	 	{title:"value", field:"value", editor: "input", headerFilter: true, hozAlign:"center"},
// 	],
//});
//
////trigger an alert message when the row is clicked
//table.on("rowClick", function(e: any, row: any){ 
//    table.updateRow(row.getData().id, {id: row.getData().id, startTime: row.getData().startTime + 1000});
//});
document.addEventListener("keypress", event => {
    console.log(event.key);
    if (event.key === "z") {
        controller.undo();
    }
})
