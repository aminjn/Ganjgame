import type { DB } from '../db.js';
import type { World } from '../game/world.js';
import type { Actions } from '../game/actions.js';
import type { Engine } from '../game/tick.js';
import type { Views } from './views.js';
import type { Hub } from './ws.js';
import type { config as Config } from '../config.js';

export interface Ctx { db: DB; w: World; a: Actions; engine: Engine; views: Views; ws: Hub; config: typeof Config }
