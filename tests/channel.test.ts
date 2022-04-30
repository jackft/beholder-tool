import {Channel, Timeline} from "../src/timeline"

describe("test channels can be deleted", () => {
  it("create_and_delete_channel", () => {
    const elem = document.createElement("div");
    const layout = {
      cssGridRows: "",
      cssGridCols: "",
      maxMediaInitWidth: 10,
      maxTimelineInitWidth: 10
    };
    const state = {
      channels: [{id: 1, parentId: null, name: "human gaze", allowedAnnotationIds: []}],
      timelineAnnotations: [],
      startTime: 0,
      endTime: 100
    }
    const timeline = new Timeline(elem, state, layout);
  })
})
