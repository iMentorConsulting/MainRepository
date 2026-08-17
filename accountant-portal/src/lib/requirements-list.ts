// Program.otherRequirements is stored as a single newline-joined, manually
// numbered string (e.g. "1. ...\n2. ...\n3. ..."). This turns it back into a
// plain list of items for rendering as <ol>/<li> instead of one text blob.
export function parseRequirementsList(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean)
}
