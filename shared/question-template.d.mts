export const OPTION_COLUMNS: number;
export const HEADER: string[];
export interface TemplateExample {
	type: string;
	title: string;
	note: string;
	question: string;
	options: string[];
	right: number[];
	answer?: string;
	feedback: string;
	correct: string;
	cells?: string[];
	bare?: boolean;
}
export const EXAMPLES: TemplateExample[];
export function exampleLines(e: TemplateExample): string[];
export function exampleRow(e: TemplateExample): string[];
export const HOW_TO: string[];
export const WORD_NOTES: string[];
export function csv(): string;
export function docx(): Uint8Array;
export function xlsx(): Uint8Array;
export const TEMPLATE_FILES: Record<string, () => Uint8Array>;
