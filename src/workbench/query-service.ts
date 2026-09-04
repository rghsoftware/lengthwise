// Compatibility name for the existing workbench module. The implementation
// now lives at the shared application boundary used by every client.
export {
  ProjectQueryService as WorkbenchQueryService,
  entityLabel,
  summarizeEntity,
} from "../application/project-query-service.ts";
