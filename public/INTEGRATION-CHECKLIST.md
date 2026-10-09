# CogniPhish — integration and preserved IDs

## What changed

Embedded semantic design tokens, navy glass surfaces, condensed headings, generated desk texture, illustrative circuit fish mark, chart theming, reduced-motion-aware entrances, visual-clone counters, tab indicator, row/cell motion, focus states, password recovery drawer and target/import modal. Existing app.js is byte-identical.

## Wrappers added

- Admin/index: an ID-free original Add Employee/CSV card is wrapped in `#cp-target-modal`; original forms and their immediate parents are unchanged. New action buttons open this shared modal.
- Auth: added brand, heading and secure-channel elements alongside existing card; forgot form stays in its original parent.
- Admin/employee: added unframed introductory band after header.
- Hosted preview: isolated frame around each standalone document; downloadable HTML does not require React or build tooling.

## Scope and verification

221 original ID occurrences preserved across 8 supplied pages, with original immediate parent tag/ID and contractual attributes checked. Original API URLs and JS state/signatures unchanged. Existing backend is absent here: authentication, delivery, exports, AI and real drill results are not verified. UI checks used signed-out auth and a clearly isolated visual fixture, never claimed authenticated end-to-end. Desktop and 360px sign-in, Escape drawer/modal close and runtime checks passed.

Only the title reference was uploaded; the fish mark is an illustrative substitute, not the missing official logo. The exact photo texture is newly generated.

Not implemented: campaign wizard/dispatch confirmation, audit pagination controls, lesson restructuring/history table, instant graded answer feedback, AI streaming/typewriter/gradient border, funnel drop-off labels, floating labels, circular tip timer, background parallax/orbs, custom heatmap count tooltip. These are left intact rather than changing existing flow or implying new backend behavior.

## Deploy

Use each HTML file in its existing route and serve the unchanged `js/app.js` at `/js/app.js`. CP_UI is already embedded after it. CDN dependencies still require internet access. `flow-preview.html` retains its original walkthrough script and receives the visual stylesheet; it is not a replacement for the real service.

## Preserved ID checklist

### admin.html

- [x] `admin-user-display`
- [x] `admin-session-id`
- [x] `logout-btn`
- [x] `admin-toast`
- [x] `globalToastText`
- [x] `tab-analytics`
- [x] `analyticsCampaignSelect`
- [x] `export-pdf-btn`
- [x] `export-csv-btn`
- [x] `metricTotalRecipients`
- [x] `kpi-total-sent`
- [x] `kpi-open-rate`
- [x] `metricTotalClicked`
- [x] `metricClickRate`
- [x] `metricTotalCompromised`
- [x] `metricCompromiseRate`
- [x] `dept-matrix-container`
- [x] `deptMatrixTableBody`
- [x] `funnelActiveCampaignLabel`
- [x] `campaignFunnelChart`
- [x] `heatmapGrid`
- [x] `runAiRiskAnalysisBtn`
- [x] `aiRiskAnalysisBox`
- [x] `tab-employees`
- [x] `addEmployeeForm`
- [x] `addEmpName`
- [x] `addEmpEmail`
- [x] `addEmpDept`
- [x] `csvUploadForm`
- [x] `csvFilePicker`
- [x] `rosterSearchInput`
- [x] `rosterRiskFilter`
- [x] `rosterTableBody`
- [x] `tab-campaigns`
- [x] `customSenderMask`
- [x] `customSenderAlias`
- [x] `createCampaignForm`
- [x] `campNameInput`
- [x] `campDescInput`
- [x] `campTemplateSelect`
- [x] `campLandingSelect`
- [x] `campaignTableBody`
- [x] `tab-quizzes`
- [x] `assign-quiz-form`
- [x] `assign-emp-select`
- [x] `assign-quiz-select`
- [x] `assigned-link-preview`
- [x] `adminQuizzesList`
- [x] `createQuizForm`
- [x] `newModTitle`
- [x] `newModContent`
- [x] `newQuizTitle`
- [x] `newQuizPassScore`
- [x] `newQText`
- [x] `newQOptA`
- [x] `newQOptB`
- [x] `newQOptC`
- [x] `newQOptD`
- [x] `newQCorrect`
- [x] `tab-audit`
- [x] `refresh-audit-btn`
- [x] `auditLogsTableBody`

### index.html

- [x] `admin-user-display`
- [x] `admin-session-id`
- [x] `logout-btn`
- [x] `admin-toast`
- [x] `globalToastText`
- [x] `tab-analytics`
- [x] `analyticsCampaignSelect`
- [x] `export-pdf-btn`
- [x] `export-csv-btn`
- [x] `metricTotalRecipients`
- [x] `kpi-total-sent`
- [x] `kpi-open-rate`
- [x] `metricTotalClicked`
- [x] `metricClickRate`
- [x] `metricTotalCompromised`
- [x] `metricCompromiseRate`
- [x] `dept-matrix-container`
- [x] `deptMatrixTableBody`
- [x] `funnelActiveCampaignLabel`
- [x] `campaignFunnelChart`
- [x] `heatmapGrid`
- [x] `runAiRiskAnalysisBtn`
- [x] `aiRiskAnalysisBox`
- [x] `tab-employees`
- [x] `addEmployeeForm`
- [x] `addEmpName`
- [x] `addEmpEmail`
- [x] `addEmpDept`
- [x] `csvUploadForm`
- [x] `csvFilePicker`
- [x] `rosterSearchInput`
- [x] `rosterRiskFilter`
- [x] `rosterTableBody`
- [x] `tab-campaigns`
- [x] `customSenderMask`
- [x] `customSenderAlias`
- [x] `createCampaignForm`
- [x] `campNameInput`
- [x] `campDescInput`
- [x] `campTemplateSelect`
- [x] `campLandingSelect`
- [x] `campaignTableBody`
- [x] `tab-quizzes`
- [x] `assign-quiz-form`
- [x] `assign-emp-select`
- [x] `assign-quiz-select`
- [x] `assigned-link-preview`
- [x] `adminQuizzesList`
- [x] `createQuizForm`
- [x] `newModTitle`
- [x] `newModContent`
- [x] `newQuizTitle`
- [x] `newQuizPassScore`
- [x] `newQText`
- [x] `newQOptA`
- [x] `newQOptB`
- [x] `newQOptC`
- [x] `newQOptD`
- [x] `newQCorrect`
- [x] `tab-audit`
- [x] `refresh-audit-btn`
- [x] `auditLogsTableBody`

### employee.html

- [x] `emp-portal-greeting`
- [x] `emp-portal-risk`
- [x] `emp-session-id`
- [x] `logout-btn`
- [x] `awareness-quote-banner`
- [x] `awareness-quote-icon`
- [x] `awareness-quote-tag`
- [x] `awareness-quote-text`
- [x] `awareness-rotate-btn`
- [x] `emp-toast`
- [x] `assigned-badge-count`
- [x] `unassigned-welcome-box`
- [x] `unassigned-welcome-text`
- [x] `emp-quizzes-list`
- [x] `emp-modules-list`
- [x] `emp-history-list`
- [x] `quiz-workspace`

### login.html

- [x] `isolation-banner`
- [x] `auth-alert`
- [x] `login-form`
- [x] `login-email`
- [x] `toggle-forgot-btn`
- [x] `login-password`
- [x] `forgot-form`
- [x] `forgot-email`
- [x] `cancel-forgot-btn`

### admin-login.html

- [x] `auth-alert`
- [x] `admin-login-form`
- [x] `admin-email`
- [x] `admin-password`

### onboarding.html

- [x] `onboarding-session-badge`
- [x] `onboarding-name`
- [x] `onboarding-alert`
- [x] `onboarding-form`
- [x] `onboarding-dept`
- [x] `onboarding-check-btn`
- [x] `logout-btn`

### reset-password.html

- [x] `reset-alert`
- [x] `reset-password-form`
- [x] `new-password`

### flow-preview.html

- [x] `virtualCursor`
- [x] `cursorDot`
- [x] `statusDot`
- [x] `slideBadge`
- [x] `dataSourceBadge`
- [x] `prevSlideBtn`
- [x] `playPauseBtn`
- [x] `playPauseLabel`
- [x] `nextSlideBtn`
- [x] `slideSelector`
- [x] `toggleNotesBtn`
- [x] `slide-0`
- [x] `s0-forgotBtn`
- [x] `s0-signInBtn`
- [x] `s0-googleBtn`
- [x] `s0-adminPortalBtn`
- [x] `slide-1`
- [x] `s1-adminSignInBtn`
- [x] `slide-2`
- [x] `s2-updatePassBtn`
- [x] `slide-3`
- [x] `s3-submitOAuthBtn`
- [x] `adminShell`
- [x] `nav-analytics`
- [x] `nav-employees`
- [x] `nav-campaigns`
- [x] `nav-awareness`
- [x] `sub-analytics`
- [x] `s4-pdfBtn`
- [x] `p-totalTargets`
- [x] `p-totalSent`
- [x] `p-totalClicked`
- [x] `p-totalCompromised`
- [x] `previewFunnelChart`
- [x] `previewHeatmapGrid`
- [x] `sub-employees`
- [x] `s5-approveBtn`
- [x] `previewEmployeeBody`
- [x] `sub-campaigns`
- [x] `s6-aiBtn`
- [x] `previewCampaignBody`
- [x] `s6-sendBtn`
- [x] `sub-awareness`
- [x] `s9-assignBtn`
- [x] `s9-addMcqBtn`
- [x] `slide-7`
- [x] `s7-axisBtn`
- [x] `slide-8`
- [x] `s8-jokeBox`
- [x] `slide-10`
- [x] `s10-riskPill`
- [x] `s10-submitQuizBtn`
- [x] `pptNotesOverlay`
- [x] `pptTitle`
- [x] `pptBullets`
- [x] `pptTechMeta`
- [x] `slideProgressBar`
