/**
 * PermissionService
 *
 * Single authoritative check for whether a user may perform a given action.
 *
 * Resolution order (highest priority first):
 *   1. Admin bypass — admin role always returns true
 *   2. User-level permission set overrides (granted / denied)
 *   3. Action registry default role requirement
 *   4. Deny (unknown action)
 *
 * See: docs/specs/auth/permissions.md §1, §6.1
 */

import type { UserRole } from '../../repositories/UserRepository';
import { userRepository } from '../../repositories/UserRepository';
import { permissionRepository } from '../../repositories/PermissionRepository';
import { ACTION_MAP, ROLE_RANK } from '../../utils/actionRegistry';
import { LoggerFactory } from '../logger/LoggerFactory';

export class PermissionService {
  private static instance: PermissionService;
  private logger = LoggerFactory.getInstance().createLogger('PermissionService');

  /** In-memory cache: userId → Map<actionKey, boolean> */
  private cache = new Map<string, Map<string, boolean>>();

  private constructor() {}

  static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  /**
   * Check whether a user may perform the given action.
   * Returns false on any error (fail-closed).
   */
  async can(userId: string, action: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = this.cache.get(userId)?.get(action);
      if (cached !== undefined) return cached;

      const result = await this.resolve(userId, action);

      // Populate cache entry
      if (!this.cache.has(userId)) {
        this.cache.set(userId, new Map());
      }
      this.cache.get(userId)!.set(action, result);

      return result;
    } catch (err) {
      this.logger.error(
        { message: `PermissionService.can(${userId}, ${action}) threw — defaulting to deny` },
        err instanceof Error ? err : new Error(String(err))
      );
      return false;
    }
  }

  /**
   * Synchronous role-only check — used by navigation composers where async
   * is not available. Does NOT consult custom permission set overrides.
   * Use can() for full resolution.
   */
  canByRole(role: UserRole | undefined, action: string): boolean {
    const effectiveRole: UserRole = role ?? 'cashier';
    if (effectiveRole === 'admin') return true;
    const def = ACTION_MAP.get(action);
    if (!def) return false;
    return ROLE_RANK[effectiveRole] >= ROLE_RANK[def.defaultMinRole];
  }

  /** Invalidate the cache for a specific user (call after role/set changes) */
  invalidateCache(userId: string): void {
    this.cache.delete(userId);
  }

  /** Invalidate the entire cache (call after bulk permission changes) */
  invalidateAll(): void {
    this.cache.clear();
  }

  // ── Private resolution ────────────────────────────────────────────────

  private async resolve(userId: string, action: string): Promise<boolean> {
    // 1. Load user role
    const user = await userRepository.findById(userId);
    if (!user) return false;

    // 2. Admin bypass
    if (user.role === 'admin') return true;

    // 3. Check permission set overrides
    const overrides = await permissionRepository.findOverridesForUser(userId);
    for (const override of overrides) {
      if (override.actionKey === action) {
        // Enforce ceiling: cannot grant admin-only actions to non-admin
        if (override.granted) {
          const def = ACTION_MAP.get(action);
          if (def && def.defaultMinRole === 'admin' && (user.role as string) !== 'admin') {
            this.logger.warn(`Override grants admin-only action '${action}' to non-admin user ${userId} — ceiling enforced`);
            return false;
          }
          return true;
        }
        return false;
      }
    }

    // 4. Fall back to action registry default
    const def = ACTION_MAP.get(action);
    if (!def) {
      this.logger.warn(`Unknown action key '${action}' — defaulting to deny`);
      return false;
    }
    return ROLE_RANK[user.role] >= ROLE_RANK[def.defaultMinRole];
  }
}

export const permissionService = PermissionService.getInstance();
