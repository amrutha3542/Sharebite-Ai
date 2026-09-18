/**
 * Shared HTTP primitives — keeps route handlers thin and consistent.
 * Senior pattern: every controller returns via `ok()` or throws `ApiError`.
 */
class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(msg, details) { return new ApiError(400, msg, details); }
  static unauthorized(msg = 'Not authenticated — please log in') { return new ApiError(401, msg); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg); }
  static conflict(msg) { return new ApiError(409, msg); }
}

/** Wrap async route handlers so rejections hit the central error middleware. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const ok = (res, data, status = 200) => res.status(status).json(data);

module.exports = { ApiError, asyncHandler, ok };
