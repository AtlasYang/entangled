import * as core from "@entangled-ui/core";
import * as auto from "@entangled-ui/core/auto";
import * as devtools from "@entangled-ui/devtools";
import * as presets from "@entangled-ui/presets";
import * as react from "@entangled-ui/react";
import { describe, expect, it } from "vitest";
import * as facade from "../src/index.js";
import * as facadeAuto from "../src/auto.js";
import * as facadeDevtools from "../src/devtools.js";
import * as facadeDevtoolsAlways from "../src/devtools-always.js";
import * as facadePresets from "../src/presets.js";
import * as facadeReact from "../src/react.js";

const same = (a: object, b: object) => {
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  for (const [k, v] of Object.entries(b)) expect((a as Record<string, unknown>)[k]).toBe(v);
};

describe("entangled-ui facade", () => {
  it("re-exports each scoped package unchanged", () => {
    same(facade, core);
    same(facadeAuto, auto);
    same(facadeReact, react);
    same(facadePresets, presets);
    same(facadeDevtools, devtools);
    same(facadeDevtoolsAlways, devtools);
  });
});
