import {Channel, Timeline} from "../src/timeline"

describe("test channels can be deleted", () => {
  it("create_and_delete_channel", () => {
    const elem = document.createElement("div");
    const timeline = new Timeline(elem, {});
    const child1 = timeline.channels[0].newChild();
    const child2 = timeline.channels[0].newChild();
    const child3 = timeline.channels[0].newChild();
    const subchild1_1 = child1.newChild();
    const subchild1_1_1 = subchild1_1.newChild();
    const subchild1_1_2 = subchild1_1.newChild();

    timeline.channels.slice().reverse().forEach(c => c.delete());
    expect(timeline.numChannels()).toBe(0);
  })
})
