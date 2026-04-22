import "./functions/hello.js";
import { AzureTableStorage } from "./shared/azure-table-storage.js";
import { BcryptPasswordHasher } from "./shared/bcrypt-password-hasher.js";
import { SystemClock } from "./shared/clock.js";
import { SystemRandom } from "./shared/random.js";
import { HmacSessionSigner } from "./shared/session-signer.js";
import { SystemLogger } from "./shared/logger.js";

import { registerLogin } from "./functions/login.js";
import { registerLogout } from "./functions/logout.js";
import { registerMe } from "./functions/me.js";
import { registerUsers } from "./functions/users.js";
import { registerUsersPublic } from "./functions/users-public.js";
import { registerUsersId } from "./functions/users-id.js";
import { registerYears } from "./functions/years.js";
import { registerYearsId } from "./functions/years-id.js";
import { registerCourses } from "./functions/courses.js";
import { registerCoursesId } from "./functions/courses-id.js";
import { registerCards } from "./functions/cards.js";
import { registerCardsId } from "./functions/cards-id.js";
import { registerSessions } from "./functions/sessions.js";

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const sessionSecret = process.env.SESSION_SECRET ?? "";

const tables = new AzureTableStorage({ connectionString });
const hasher = new BcryptPasswordHasher();
const clock = new SystemClock();
const random = new SystemRandom();
const signer = new HmacSessionSigner({ secret: sessionSecret, clock });
const logger = new SystemLogger();

registerLogin({ tables, hasher, signer, clock, logger });
registerLogout();
registerMe({ tables, signer });
registerUsers({ tables, signer, hasher, random, clock });
registerUsersPublic({ tables });
registerUsersId({ tables, signer, hasher });
registerYears({ tables, signer, random });
registerYearsId({ tables, signer });
registerCourses({ tables, signer, clock, random });
registerCoursesId({ tables, signer });
registerCards({ tables, signer, clock, random });
registerCardsId({ tables, signer, clock });
registerSessions({ tables, signer, clock, random });
