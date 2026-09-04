import { expect, test } from "bun:test";
import {
  LengthwiseApplication,
  WorkflowCoordinator,
  loadCanonicalSkillRegistry,
} from "lengthwise";

test("package root exposes the headless API without starting a client or runtime", () => {
  expect(LengthwiseApplication.open).toBeFunction();
  expect(WorkflowCoordinator.open).toBeFunction();
  expect(loadCanonicalSkillRegistry).toBeFunction();
});
