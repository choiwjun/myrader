// @TASK P2-R1 - business / placeCandidate 모듈 배럴 (앱 내부 리소스 진입점)
// @SPEC docs/planning/07-coding-convention.md §2 (앱은 서비스 레이어 경유)
//
// Route Handler 는 이 배럴만 import 한다. 구체 파일(서비스/저장소/검색)은 경계 뒤에 둔다.

export {
  type PlaceCandidate,
  type PlaceSearchInput,
  type PlaceSearchOptions,
  type PlaceSearchProvider,
  createNaverPlaceSearchProvider,
  isNaverApiConfigured,
  searchPlaceCandidates,
} from "./place-search.js";

export {
  type BusinessRecord,
  type BusinessRepository,
  type BusinessView,
  type ConfirmBusinessInput,
  type CreateBusinessInput,
  confirmBusiness,
  extractNaverPlaceId,
  getBusinessView,
  placeUrlFromNaverPlaceId,
  toBusinessView,
} from "./business-service.js";

export {
  createDbBusinessRepository,
  getDefaultBusinessRepository,
} from "./business-repository.js";
