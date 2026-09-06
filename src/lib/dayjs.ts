/**
 * Copyright (c) 2026 NexaWork
 * 
 * This source code is licensed under the AGPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
// Single, fully-plugged Day.js instance. Import THIS everywhere instead of the raw
// "dayjs" package, so relative-time (.fromNow) and the other plugins are ALWAYS
// available. A plain `import dayjs from "dayjs"` gives an un-extended instance, so
// calling .fromNow()/.isBetween()/.isToday() throws "fromNow is not a function" and
// white-screens the page. Every plugin the app uses is extended here exactly once.
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import isBetween from "dayjs/plugin/isBetween";
import isToday from "dayjs/plugin/isToday";

dayjs.extend(relativeTime);
dayjs.extend(isBetween);
dayjs.extend(isToday);

export type { Dayjs } from "dayjs";
export default dayjs;
