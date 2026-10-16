// The step-by-step guide on the camera heart rate intro (HeartCamera i18n
// namespace). The web shows the same steps + tips, pointing to this app.
export const GUIDE_STEPS = ["step1", "step2", "step3", "step4"] as const;
export const GUIDE_TIPS = ["tip1", "tip2", "tip3"] as const;
export const GUIDE_KEYS = ["guideTitle", "illustration", "howTitle", "howBody", "accuracyTitle", "accuracyBody", "tipsTitle", ...GUIDE_STEPS, ...GUIDE_TIPS] as const;
