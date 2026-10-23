export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  static badRequest(message, fields) {
    return new ApiError(400, 'bad_request', message, fields);
  }

  static unauthorized(message = 'Sign in to continue') {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'Not allowed for your role') {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message, fields) {
    return new ApiError(409, 'conflict', message, fields);
  }
}

export function handler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

const PG_CODES = {
  '23505': () => ApiError.conflict('That value is already in use'),
  '23503': () => ApiError.conflict('Another record still refers to this one'),
  '23514': () => ApiError.badRequest('A field value is outside the allowed set'),
};

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err?.name === 'ZodError') {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(422).json({ error: { code: 'validation_failed', message: 'Check the highlighted fields', fields } });
  }

  const mapped = err instanceof ApiError ? err : (PG_CODES[err?.code] || (() => null))();
  if (mapped) {
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message, fields: mapped.fields } });
  }

  console.error(err);
  return res.status(500).json({ error: { code: 'internal', message: 'The server could not complete the request' } });
}
