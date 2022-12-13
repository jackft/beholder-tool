import * as c from './annotator';

const config = {
    timeline: {
        backgroundColor: 0x1e1e1e
    }
}

// @ts-ignore
const controller = new c.Annotator(document.getElementById("controller"), config);

//, {
//    timeline_canvas: {
//	    view: document.getElementById("timeline-canvas") as HTMLCanvasElement,
//	    resolution: window.devicePixelRatio || 1,
//	    autoDensity: true,
//	    backgroundColor: 0x1e1e1e,
//	    width: W,
//	    height: H
//    },
//    summary_canvas: {
//	    view: document.getElementById("summary-canvas") as HTMLCanvasElement,
//	    resolution: window.devicePixelRatio || 1,
//	    autoDensity: true,
//	    backgroundColor: 0x1e1e1e,
//	    width: W,
//	    height: 50
//    },
//    timeline: {
//        milliseconds: 10000
//    },
//    table: {
//        element: "#example-table",
//
//    },
//    media: {
//        element: document.querySelector("#container"),
//        src: "./video.mp4"
//    }
//});

//const cstatewf: ChannelState = {
//    id: -2,
//    parentId:  null,
//    name: "blah",
//    background: "./waveform.png",
//    showBackground: true,
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstatewf);
//
//const cstate0: ChannelState = {
//    id: -1,
//    parentId:  null,
//    name: "blah",
//    background: "./spectrogram.png",
//    showBackground: true,
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstate0);
//
//const cstate: ChannelState = {
//    id: 0,
//    parentId:  null,
//    name: "blah",
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstate);
//const cstate2: ChannelState = {
//    id: 1,
//    parentId:  null,
//    name: "blah",
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstate2);
//const cstate3: ChannelState = {
//    id: 2,
//    parentId:  null,
//    name: "blah",
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstate3);
//const cstate4: ChannelState = {
//    id: 3,
//    parentId:  null,
//    name: "blah",
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstate4);
//const cstate5: ChannelState = {
//    id: 4,
//    parentId:  null,
//    name: "blah",
//    allowedAnnotationIds: []
//};
//controller.createChannel(cstate5);
//const states = [];
//for (let i = 0; i < 1000; ++i) {
//    const s = Math.random()*2000000;
//    const w = Math.random()*30000;
//    const state = {
//        id: i,
//        channelId: Math.min(Math.floor(i / 200), 3),
//        type: "interval",
//        value: "hi",
//        startFrame: 0,
//        endFrame: 0,
//        startTime: s,
//        endTime: s + w,
//        modifiers: []
//    };
//    // @ts-ignore
//    states.push(state);
//}
//controller.batchCreateTimelineAnnotations(states);

fetch("./blah.json")
    .then((response) => response.json())
    .then((json) => {
        controller.readState(json);
        //json.timeline.channels.forEach(channel => {
        //    controller.createChannel(channel)
        //})
        //controller.batchCreateTimelineAnnotations(json.timeline.timelineAnnotations)
    });

document.addEventListener("keypress", event => {
    console.log(event.key);
    if (event.key === "z") {
        controller.undo();
    }
    if (event.key === "y") {
        controller.redo();
    }
})
document.querySelector("#download")?.addEventListener("click", (event) => {
    console.log(controller.jsonDump());
});
