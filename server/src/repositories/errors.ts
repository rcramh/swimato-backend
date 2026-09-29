/* ---------------------------------------------------------------
   Repository errors

   Repositories speak in storage terms, not HTTP. Services translate
   these into AppErrors. The Postgres repository will throw the same
   class on a unique violation (SQLSTATE 23505), so no service changes
   when the storage does.
----------------------------------------------------------------*/

export class DuplicateKeyError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`Duplicate value for ${field}`);
    this.name = "DuplicateKeyError";
    this.field = field;
  }
}
