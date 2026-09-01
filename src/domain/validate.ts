import typia from "typia";
import type { IValidation } from "typia";
import type {
  AcceptanceCriterionEntity,
  DecisionEntity,
  DocumentEntity,
  Entity,
  EntityType,
  FeatureEntity,
  NonFunctionalRequirementEntity,
  PlanEntity,
  RequirementEntity,
  RoadmapItemEntity,
  TaskEntity,
  VerificationEntity,
  QuestionEntity, EvidenceEntity, BuildContractEntity,
} from "./entities.ts";

type ValidatorFor<TType extends EntityType> = (input: unknown) => IValidation<Extract<Entity, { type: TType }>>;

/** One typia-generated structural validator per entity type (AC-005-02, AC-005-03). */
export const ENTITY_VALIDATORS: { [K in EntityType]: ValidatorFor<K> } = {
  requirement: typia.createValidate<RequirementEntity>(),
  "non-functional-requirement": typia.createValidate<NonFunctionalRequirementEntity>(),
  "acceptance-criterion": typia.createValidate<AcceptanceCriterionEntity>(),
  decision: typia.createValidate<DecisionEntity>(),
  document: typia.createValidate<DocumentEntity>(),
  plan: typia.createValidate<PlanEntity>(),
  feature: typia.createValidate<FeatureEntity>(),
  task: typia.createValidate<TaskEntity>(),
  verification: typia.createValidate<VerificationEntity>(),
  "roadmap-item": typia.createValidate<RoadmapItemEntity>(),
  question: typia.createValidate<QuestionEntity>(),
  evidence: typia.createValidate<EvidenceEntity>(),
  "build-contract": typia.createValidate<BuildContractEntity>(),
};

export function validateEntity<TType extends EntityType>(
  type: TType,
  candidate: unknown,
): IValidation<Extract<Entity, { type: TType }>> {
  return ENTITY_VALIDATORS[type](candidate);
}
