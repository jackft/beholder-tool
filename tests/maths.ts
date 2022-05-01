import {LinearScale} from "../src/scales"

describe("tests linear scales", () => {
  it("linear_scales", () => {
    const scale_a = new LinearScale([5, 10], [10, 20]);
    expect(scale_a.call(5)).toBe(10);
    expect(scale_a.inv(10)).toBe(5);
    expect(scale_a.call(10)).toBe(20);
    expect(scale_a.inv(20)).toBe(10);


    const scale_b = new LinearScale([10, 5], [10, 20]);
    expect(scale_b.call(10)).toBe(10);
    expect(scale_b.inv(10)).toBe(10);
    expect(scale_b.call(5)).toBe(20);
    expect(scale_b.inv(10)).toBe(5);
  })
})
