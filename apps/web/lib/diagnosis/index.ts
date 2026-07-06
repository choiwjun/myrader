// @TASK P1-R2 - diagnosis 모듈 배럴 (앱 내부 진단 리소스 진입점)
// @SPEC docs/planning/07-coding-convention.md §2 (앱은 서비스 레이어 경유)
//
// Route Handler / 잡 배선은 이 배럴만 import 한다. 구체 파일 경로(서비스/저장소/핸들러)는
// 이 경계 뒤에 둔다.

export {
  type CreateDiagnosisInput,
  type DiagnosisCrawlFailureReason,
  type DiagnosisPatch,
  type DiagnosisRecord,
  type DiagnosisRepository,
  type DiagnosisStatus,
  type DiagnosisView,
  type MarkFailedInput,
  type ReflectResultInput,
  createDiagnosis,
  deriveOverallSignal,
  getDiagnosisView,
  markDiagnosisFailed,
  markDiagnosisRunning,
  reflectDiagnosisResult,
  toDiagnosisView,
} from "./diagnosis-service.js";

export {
  createDbDiagnosisRepository,
  getDefaultDiagnosisRepository,
} from "./diagnosis-repository.js";

export {
  type DiagnosisBusinessProfile,
  type DiagnosisJobPayload,
  DEFAULT_DIAGNOSIS_MODULES,
  DiagnosisBusinessProfileSchema,
  DiagnosisJobPayloadSchema,
  buildDiagnosisJobPayload,
  parseStoredDiagnosisJobPayload,
  resolveDiagnosisTarget,
} from "./job-payload.js";
export {
  type DiagnosisHandlerDeps,
  type RunDiagnosisPipeline,
  buildDiagnosisHandler,
} from "./diagnosis-handler.js";

export { mapCrawlFailureToReason } from "./crawl-failure.js";

export {
  type ChannelStatus,
  type ChannelStatusViewInput,
  type GoogleReadinessInput,
  type PersistedEngineResultLike,
  deriveAiChannelStatus,
  deriveChannelStatuses,
  deriveChannelStatusesFromPersisted,
  deriveChannelStatusesFromView,
  deriveGoogleChannelStatus,
  deriveNaverChannelStatus,
  isGroundedCitation,
} from "./channel-status-service.js";

export {
  type Competitor,
  type CompetitorChannel,
  type CompetitorInput,
  type CompetitorOptions,
  type CompetitorSource,
  type CompetitorViewResult,
  type PersistedCompetitorLike,
  buildLossHeadline,
  deriveCompetitors,
  deriveCompetitorsFromDiagnosis,
  deriveCompetitorViewFromPersisted,
  deriveCompetitorViewFromView,
  sourceToBadge,
} from "./competitor-service.js";

export {
  type CompetitorReportLike,
  type DeriveGapInput,
  type DeriveGapOptions,
  type EngineActionType,
  type EngineCategory,
  type EnginePriority,
  type GapActionTier,
  type GapAnalyzerPort,
  type GapCategoryLabel,
  type GapInputLike,
  type GapItem,
  type GapItemOptions,
  type GapMatrixRowLike,
  type GapResultLike,
  type GapViewResult,
  type PersistedGapRowLike,
  type PriorityGapLike,
  type ScoreSnapshotLike,
  type SelfReportLike,
  buildGapIntro,
  deriveGapItems,
  deriveGapItemsFromResult,
  deriveGapViewFromPersisted,
  deriveGapViewFromView,
  ruleToBossLabel,
} from "./gap-service.js";

export {
  type Action,
  type ActionOptions,
  type ActionTierClass,
  type ActionViewResult,
  buildActionIntro,
  deriveActions,
  deriveActionViewFromGapItems,
  deriveActionViewFromView,
  pickTodayOneIndex,
} from "./action-service.js";

export {
  type AssetGenInput,
  type AssetGenOptions,
  type DbTypeToAssetType,
  type GeneratedAsset,
  type GeneratedAssetType,
  type GeneratedAssetViewResult,
  type PersistedAssetOptions,
  type PersistedGeneratedAssetLike,
  type SnippetGenPort,
  type SnippetGenRequest,
  ASSET_TYPES,
  assertGeneratedAssetHonest,
  buildAssetsIntro,
  defaultSnippetGen,
  deriveGeneratedAssets,
  deriveGeneratedAssetsWithEngine,
  deriveGeneratedAssetViewFromPersisted,
  deriveGeneratedAssetViewFromView,
} from "./generated-asset-service.js";

export {
  type BuildPersistenceInput,
  type CompetitorInsert,
  type EngineResultChannel,
  type EngineResultInsert,
  type GapRowInsert,
  type GeneratedAssetInsert,
  type ActionInsert,
  type NaverCompetitorTop,
  type PersistencePlan,
  assetTypeToDb,
  buildPersistencePlan,
  categoryToChannel,
  dbToAssetType,
} from "./diagnosis-persistence.js";

export {
  type PersistResult,
  type PersistedAction,
  type PersistedCompetitor,
  type PersistedEngineResult,
  type PersistedGapRow,
  type PersistedGeneratedAsset,
  getDefaultDb,
  getPersistedActions,
  getPersistedCompetitors,
  getPersistedEngineResults,
  getPersistedGapRows,
  getPersistedGeneratedAssets,
  persistDiagnosisArtifacts,
} from "./persistence-repository.js";

export { copyGuardViolation, passesCopyGuard } from "./copy-guard.js";
