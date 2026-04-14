/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Optional JWT Authentication Guard
 *
 * This guard allows both authenticated and unauthenticated requests:
 * - If a valid JWT token is provided: validates it and attaches user to request
 * - If no token or invalid token is provided: continues without authentication (req.user = undefined)
 *
 * Use this for public endpoints that should work for both logged-in users and guests.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const result = super.canActivate(context);

    // Handle different return types
    if (result instanceof Promise) {
      return result.catch((err) => {
        if (err instanceof UnauthorizedException) {
          const request = context.switchToHttp().getRequest();
          request.user = undefined;
          return true;
        }
        return true;
      });
    }

    if (result instanceof Observable) {
      return result.pipe(
        catchError((err) => {
          if (err instanceof UnauthorizedException) {
            const request = context.switchToHttp().getRequest();
            request.user = undefined;
            return of(true);
          }
          return of(true);
        }),
      );
    }

    // If it's a boolean (synchronous), handle it
    if (typeof result === 'boolean') {
      return result;
    }

    // Default: allow
    return true;
  }

  /**
   * Override handleRequest to not throw errors
   * Instead, return undefined when authentication fails
   */
  handleRequest<TUser = any>(err: any, user: TUser): TUser | undefined {
    // If there's an error or no user, return undefined instead of throwing
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
