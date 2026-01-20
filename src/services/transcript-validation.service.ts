/**
 * Transcript Validation Service
 * Provides validation logic for transcript editing operations
 * Validates: Requirements 4.2, 4.3
 */

/**
 * TranscriptWord interface representing a word with timing information
 */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * TranscriptValidationService
 * Handles all validation logic for transcript editing
 */
export class TranscriptValidationService {
  /**
   * Validate word timing constraints
   * Validates: Requirement 4.3 - start time < end time
   * 
   * @param word - The word object to validate
   * @param index - The index of the word in the transcript (for error messages)
   * @returns ValidationResult indicating if the word is valid
   */
  static validateWordTiming(
    word: Partial<TranscriptWord>,
    index: number
  ): ValidationResult {
    // Check required fields
    if (word.word !== undefined && typeof word.word !== "string") {
      return {
        valid: false,
        error: `Word at index ${index}: 'word' must be a string`,
      };
    }

    if (word.start !== undefined && typeof word.start !== "number") {
      return {
        valid: false,
        error: `Word at index ${index}: 'start' must be a number`,
      };
    }

    if (word.end !== undefined && typeof word.end !== "number") {
      return {
        valid: false,
        error: `Word at index ${index}: 'end' must be a number`,
      };
    }

    // Validate non-negative times
    if (word.start !== undefined && word.start < 0) {
      return {
        valid: false,
        error: `Word at index ${index}: 'start' time must be non-negative`,
      };
    }

    if (word.end !== undefined && word.end < 0) {
      return {
        valid: false,
        error: `Word at index ${index}: 'end' time must be non-negative`,
      };
    }

    // Validate start < end when both are provided
    // Validates: Requirement 4.3
    if (
      word.start !== undefined &&
      word.end !== undefined &&
      word.start >= word.end
    ) {
      return {
        valid: false,
        error: `Word at index ${index}: 'start' time (${word.start}) must be less than 'end' time (${word.end})`,
      };
    }

    // Validate confidence if provided
    if (word.confidence !== undefined) {
      if (typeof word.confidence !== "number") {
        return {
          valid: false,
          error: `Word at index ${index}: 'confidence' must be a number`,
        };
      }
      if (word.confidence < 0 || word.confidence > 1) {
        return {
          valid: false,
          error: `Word at index ${index}: 'confidence' must be between 0 and 1`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate a complete word object (all fields required)
   * Used when creating or fully updating a word
   * 
   * @param word - The complete word object to validate
   * @param index - The index of the word in the transcript
   * @returns ValidationResult indicating if the word is valid
   */
  static validateCompleteWord(
    word: TranscriptWord,
    index: number
  ): ValidationResult {
    // Check all required fields are present
    if (typeof word.word !== "string") {
      return {
        valid: false,
        error: `Word at index ${index}: 'word' must be a string`,
      };
    }

    if (typeof word.start !== "number") {
      return {
        valid: false,
        error: `Word at index ${index}: 'start' must be a number`,
      };
    }

    if (typeof word.end !== "number") {
      return {
        valid: false,
        error: `Word at index ${index}: 'end' must be a number`,
      };
    }

    // Validate non-negative times
    if (word.start < 0) {
      return {
        valid: false,
        error: `Word at index ${index}: 'start' time must be non-negative`,
      };
    }

    if (word.end < 0) {
      return {
        valid: false,
        error: `Word at index ${index}: 'end' time must be non-negative`,
      };
    }

    // Validate start < end
    // Validates: Requirement 4.3
    if (word.start >= word.end) {
      return {
        valid: false,
        error: `Word at index ${index}: 'start' time (${word.start}) must be less than 'end' time (${word.end})`,
      };
    }

    // Validate confidence if provided
    if (word.confidence !== undefined) {
      if (typeof word.confidence !== "number") {
        return {
          valid: false,
          error: `Word at index ${index}: 'confidence' must be a number`,
        };
      }
      if (word.confidence < 0 || word.confidence > 1) {
        return {
          valid: false,
          error: `Word at index ${index}: 'confidence' must be between 0 and 1`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate an array of transcript words
   * 
   * @param words - Array of words to validate
   * @returns ValidationResult indicating if all words are valid
   */
  static validateTranscriptWords(words: TranscriptWord[]): ValidationResult {
    if (!Array.isArray(words)) {
      return {
        valid: false,
        error: "transcriptWords must be an array",
      };
    }

    for (let i = 0; i < words.length; i++) {
      const validation = this.validateCompleteWord(words[i], i);
      if (!validation.valid) {
        return validation;
      }
    }

    return { valid: true };
  }

  /**
   * Merge word update with existing word, preserving timestamps when only text is modified
   * Validates: Requirement 4.2 - preserve word-level timestamps when text is modified
   * 
   * @param existingWord - The existing word object
   * @param updates - Partial updates to apply
   * @returns The merged word object
   */
  static mergeWordUpdate(
    existingWord: TranscriptWord,
    updates: Partial<TranscriptWord>
  ): TranscriptWord {
    return {
      word: updates.word !== undefined ? updates.word : existingWord.word,
      start: updates.start !== undefined ? updates.start : existingWord.start,
      end: updates.end !== undefined ? updates.end : existingWord.end,
      confidence:
        updates.confidence !== undefined
          ? updates.confidence
          : existingWord.confidence,
    };
  }

  /**
   * Check if a word update only modifies text (preserves timestamps)
   * Validates: Requirement 4.2
   * 
   * @param updates - The updates being applied
   * @returns true if only text is being modified
   */
  static isTextOnlyUpdate(updates: Partial<TranscriptWord>): boolean {
    return (
      updates.word !== undefined &&
      updates.start === undefined &&
      updates.end === undefined
    );
  }

  /**
   * Regenerate transcript text from words array
   * 
   * @param words - Array of transcript words
   * @returns The concatenated transcript text
   */
  static regenerateTranscriptText(words: TranscriptWord[]): string {
    return words.map((w) => w.word).join(" ");
  }
}
