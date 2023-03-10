//import * as c from './annotator';
//
export { Channel, Timeline } from "./timeline";
export { Annotator } from "./annotator";

//const config = {
//    timeline: {
//        backgroundColor: 0x1e1e1e
//    }
//}

// @ts-ignore
//const controller = new c.Annotator(document.getElementById("controller"), config);

//fetch("./blah.json")
//    .then((response) => response.json())
//    .then((json) => {
//        controller.readState(json);
//    });
//
//document.addEventListener("keypress", event => {
//    console.log(event.key);
//    if (event.key === "z") {
//        controller.undo();
//    }
//    if (event.key === "y") {
//        controller.redo();
//    }
//    if (event.key === " ") {
//        event.preventDefault();
//        controller.playpause();
//    }
//})
//document.querySelector("#download")?.addEventListener("click", (event) => {
//    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(controller.json()));
//    const dlAnchorElem = document.createElement("a");
//    dlAnchorElem.setAttribute("href",     dataStr     );
//    dlAnchorElem.setAttribute("download", "annotation.json");
//    dlAnchorElem.click();
//});
