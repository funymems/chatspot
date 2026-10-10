import { z } from "zod";
import { ru } from "zod/locales";

// Russian default messages for any Zod check without a custom message (client and server).
z.config(ru());
