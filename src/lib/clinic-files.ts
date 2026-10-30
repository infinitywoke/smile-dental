// Where the clinic's files are kept (multi-clinic slice 2b, 30 Oct 2026): in the clinic's folder, a visit's
// photos and recordings at <clinic id>/<visit id>/<file> and a bill at <clinic id>/<cost id>.<ext>. Files from
// before sit in the folder of the login that took them (<user id>/…): the clinic still reads and removes them
// there, and a phone still running an older copy of the app may upload there once more.

// The folders a visit's files may be in: the clinic's, and the signed-in person's own
export function visitFolders(clinicId: string, userId: string, visitId: string): string[] {
  return [...new Set([clinicId, userId])].map((owner) => `${owner}/${visitId}`)
}

// A file in one of those folders (a photo the phone has just uploaded, say)
export function isVisitFile(path: string, folders: string[]): boolean {
  return folders.some((folder) => path.startsWith(`${folder}/`) && path.length > folder.length + 1)
}

// A bill's file: named after its cost, in the clinic's folder or the signed-in person's own
export function isBillFile(path: string, costId: string, owners: string[]): boolean {
  return owners.some((owner) => new RegExp(`^${owner}/${costId}\\.(jpg|png|webp|pdf)$`).test(path))
}
