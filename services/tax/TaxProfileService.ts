import { taxProfileRepository, TaxProfileRow, CreateTaxProfileInput, UpdateTaxProfileInput } from '../../repositories/TaxProfileRepository';
import { LoggerFactory } from '../logger/LoggerFactory';

const logger = LoggerFactory.getInstance().createLogger('TaxProfileService');

/**
 * Tax Profile Service
 *
 * Wraps TaxProfileRepository with business logic for managing tax profiles.
 * Spec: docs/specs/catalog/products.md section 2.10, 2.11
 */
export class TaxProfileService {
  /**
   * Create a new tax profile
   * Spec requirement 2.10.1
   */
  async createProfile(input: CreateTaxProfileInput): Promise<TaxProfileRow> {
    const id = await taxProfileRepository.create(input);
    const profile = await taxProfileRepository.findById(id);

    if (!profile) {
      throw new Error(`Failed to create tax profile: ${input.name}`);
    }

    logger.info({ message: 'Tax profile created', profileId: id, name: input.name });
    return profile;
  }

  /**
   * Update an existing tax profile
   * Spec requirement 2.10.3
   */
  async updateProfile(id: string, input: UpdateTaxProfileInput): Promise<TaxProfileRow> {
    await taxProfileRepository.update(id, input);
    const profile = await taxProfileRepository.findById(id);

    if (!profile) {
      throw new Error(`Tax profile not found: ${id}`);
    }

    logger.info({ message: 'Tax profile updated', profileId: id });
    return profile;
  }

  /**
   * Delete a tax profile
   * Spec requirement 2.10.4: Cannot delete default profile
   */
  async deleteProfile(id: string): Promise<boolean> {
    const profile = await taxProfileRepository.findById(id);

    if (!profile) {
      logger.warn({ message: 'Tax profile not found for deletion', profileId: id });
      return false;
    }

    if (profile.is_default === 1) {
      logger.warn({ message: 'Cannot delete default tax profile', profileId: id });
      return false;
    }

    await taxProfileRepository.delete(id);
    logger.info({ message: 'Tax profile deleted', profileId: id });
    return true;
  }

  /**
   * Get all tax profiles
   */
  async getAllProfiles(): Promise<TaxProfileRow[]> {
    return taxProfileRepository.findAll();
  }

  /**
   * Get all active tax profiles
   */
  async getActiveProfiles(): Promise<TaxProfileRow[]> {
    return taxProfileRepository.findActive();
  }

  /**
   * Get a tax profile by ID
   * Spec requirement 2.11.1: Used for offline product tax resolution
   */
  async getProfileById(id: string): Promise<TaxProfileRow | null> {
    return taxProfileRepository.findById(id);
  }

  /**
   * Get the default tax profile
   * Spec requirement 2.11.1, 2.11.2: Fallback when no profile is specified
   *
   * Seeds default profiles lazily on first call if the table is empty,
   * so no explicit bootstrap call is required at app startup.
   */
  async getDefaultProfile(): Promise<TaxProfileRow | null> {
    const profile = await taxProfileRepository.findDefault();
    if (profile) return profile;

    await this.seedDefaults();
    return taxProfileRepository.findDefault();
  }

  /**
   * Resolve tax rate for a tax code by name matching
   * Spec requirement 2.11.2: Used for online product tax resolution
   *
   * @param taxCode - Platform tax code (e.g. 'standard', 'reduced-rate', 'zero-rate', 'exempt')
   * @returns Matching tax profile or default profile
   */
  async resolveRateForTaxCode(taxCode: string): Promise<TaxProfileRow | null> {
    if (!taxCode) {
      return this.getDefaultProfile();
    }

    // Normalize tax code for matching
    const normalizedCode = taxCode.toLowerCase().trim();

    // Get all active profiles
    const profiles = await taxProfileRepository.findActive();

    // Try to find a profile whose name contains the tax code (case-insensitive)
    const match = profiles.find(p => p.name.toLowerCase().includes(normalizedCode) || normalizedCode.includes(p.name.toLowerCase()));

    if (match) {
      logger.debug({ message: 'Tax code matched to profile', taxCode, profileId: match.id, profileName: match.name });
      return match;
    }

    // No match found, use default
    logger.debug({ message: 'Tax code not matched, using default profile', taxCode });
    return this.getDefaultProfile();
  }

  /**
   * Seed default tax profiles
   * Spec requirement 2.10.5, 2.10.6: Create defaults only if none exist
   *
   * Creates three profiles:
   * - Standard Rate (20%, default)
   * - Reduced Rate (5%)
   * - Zero Rate (0%)
   */
  async seedDefaults(): Promise<void> {
    const existing = await taxProfileRepository.findAll();

    if (existing.length > 0) {
      logger.debug({ message: 'Tax profiles already exist, skipping seed', count: existing.length });
      return;
    }

    logger.info({ message: 'Seeding default tax profiles' });

    await this.createProfile({
      name: 'Standard Rate',
      rate: 0.2, // 20%
      isDefault: true,
      description: 'UK standard VAT rate',
    });

    await this.createProfile({
      name: 'Reduced Rate',
      rate: 0.05, // 5%
      isDefault: false,
      description: 'UK reduced VAT rate',
    });

    await this.createProfile({
      name: 'Zero Rate',
      rate: 0, // 0%
      isDefault: false,
      description: 'Zero-rated goods',
    });

    logger.info({ message: 'Default tax profiles seeded successfully' });
  }
}

// Singleton instance
export const taxProfileService = new TaxProfileService();
