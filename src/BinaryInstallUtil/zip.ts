/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { open as _openZip, Entry, ZipFile } from "yauzl";
import * as path from "path";
import * as mkdirp from "mkdirp";
import { Sequencer } from "./async";
import { Readable } from "stream";
import { WriteStream, createWriteStream } from "fs";

export type ExtractErrorType = "CorruptZip" | "Incomplete";

export class ExtractError extends Error {
  readonly type?: ExtractErrorType;
  readonly cause: Error;

  constructor(type: ExtractErrorType | undefined, cause: Error) {
    let message = cause.message;
    if (type === "CorruptZip") {
      message = `Corrupt ZIP: ${message}`;
    }

    super(message);
    this.type = type;
    this.cause = cause;
  }
}

/**
 * Helper class to handle unzipping the contents of a zip archive into a specified directory.
 *
 * Code adapted from https://github.com/microsoft/vscode/blob/6ffa7d5887e60244169ef9699842ff276216be10/src/vs/base/node/zip.ts
 */
export class Unzipper {
  // public readonly eventEmitter = new EventEmitter({ wildcard: true });

  public extract(zipPath: string, targetPath: string): Promise<void> {
    let promise = this.openZip(zipPath, true);
    return promise.then((zipfile) => zipfile && this.extractZip(zipfile, targetPath));
  }

  private openZip(zipFile: string, lazy: boolean = false): Promise<ZipFile> {
    return new Promise((resolve, reject) => {
      _openZip(zipFile, lazy ? { lazyEntries: true } : undefined!, (error?: Error, zipfile?: ZipFile) => {
        if (error || !zipFile) {
          reject(toExtractError(error || new Error("No zip file")));
        } else {
          resolve(zipfile!);
        }
      });
    });
  }

  private extractZip(zipfile: ZipFile, targetPath: string): Promise<void> {
    let extractedEntriesCount = 0;

    return new Promise((c, e) => {
      const throttler = new Sequencer();

      const readNextEntry = () => {
        extractedEntriesCount++;
        zipfile.readEntry();
      };

      zipfile.once("error", e);
      zipfile.once("close", () => {
        if (zipfile.entryCount === extractedEntriesCount) {
          c();
        } else {
          e(
            new ExtractError(
              "Incomplete",
              new Error(`Incomplete. Found ${extractedEntriesCount} of ${zipfile.entryCount} entries`)
            )
          );
        }
      });
      zipfile.readEntry();
      zipfile.on("entry", (entry: Entry) => {
        // directory file names end with '/'
        if (/\/$/.test(entry.fileName)) {
          const targetFileName = path.join(targetPath, entry.fileName);
          mkdirp(targetFileName)
            .then(() => readNextEntry())
            .then(undefined, e);
          return;
        }

        const stream = this.openZipStream(zipfile, entry);
        const mode = modeFromEntry(entry);

        throttler
          .queue(() =>
            stream.then((readable) =>
              this.extractEntry(
                readable,
                entry.fileName,
                mode,
                targetPath,
                extractedEntriesCount + 1,
                zipfile.entryCount
              ).then(() => readNextEntry())
            )
          )
          .then(undefined, e);
      });
    });
  }

  private async extractEntry(
    stream: Readable,
    fileName: string,
    mode: number,
    targetPath: string,
    entryNumber: number,
    totalEntries: number
  ): Promise<void> {
    const dirName = path.dirname(fileName);
    const targetDirName = path.join(targetPath, dirName);
    if (targetDirName.indexOf(targetPath) !== 0) {
      return Promise.reject(new Error(`Error extracting ${fileName}. Invalid file.`));
    }
    const targetFileName = path.join(targetPath, fileName);

    let istream: WriteStream;

    await mkdirp(targetDirName);

    return new Promise<void>((c, e) => {
      try {
        istream = createWriteStream(targetFileName, { mode });
        istream.once("close", () => {
          // this.eventEmitter.emit(Events.ENTRY_EXTRACTED, targetFileName, entryNumber, totalEntries);
          c();
        });
        istream.once("error", e);
        stream.once("error", e);
        stream.pipe(istream);
      } catch (error) {
        e(error);
      }
    });
  }

  private openZipStream(zipFile: ZipFile, entry: Entry): Promise<Readable> {
    return new Promise((resolve, reject) => {
      zipFile.openReadStream(entry, (error?: Error, stream?: Readable) => {
        if (error || !stream) {
          reject(toExtractError(error || new Error("No stream")));
        } else {
          resolve(stream);
        }
      });
    });
  }
}

function toExtractError(err: Error): ExtractError {
  if (err instanceof ExtractError) {
    return err;
  }

  let type: ExtractErrorType | undefined = undefined;

  if (/end of central directory record signature not found/.test(err.message)) {
    type = "CorruptZip";
  }

  return new ExtractError(type, err);
}

// tslint:disable: no-bitwise
function modeFromEntry(entry: Entry): number {
  const attr = entry.externalFileAttributes >> 16 || 33188;

  return [448 /* S_IRWXU */, 56 /* S_IRWXG */, 7 /* S_IRWXO */]
    .map((mask) => attr & mask)
    .reduce((a, b) => a + b, attr & 61440 /* S_IFMT */);
}
