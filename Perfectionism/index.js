/*
 * index.js
 * Perfectionism (Pengu Loader). Loads the core and every plugin in this folder.
 */

import { init as initCore, boot } from "./perfectionist-utils.js";

export function init(context) {
  initCore(context);
  return boot(context);
}
