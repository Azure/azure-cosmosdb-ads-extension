/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from "os";
import * as cp from "child_process";
import * as fs from "fs";
import { ExecException } from "child_process";

const unknown = "unknown";

export enum Runtime {
  Unknown = <any>"Unknown",
  Windows_86 = <any>"Windows_86",
  Windows_64 = <any>"Windows_64",
  OSX = <any>"OSX",
  CentOS_7 = <any>"CentOS_7",
  Debian_8 = <any>"Debian_8",
  Fedora_23 = <any>"Fedora_23",
  OpenSUSE_13_2 = <any>"OpenSUSE_13_2",
  SLES_12_2 = <any>"SLES_12_2",
  RHEL_7 = <any>"RHEL_7",
  Ubuntu_14 = <any>"Ubuntu_14",
  Ubuntu_16 = <any>"Ubuntu_16",
  Linux_64 = <any>"Linux_64",
  Linux_86 = <any>"Linux-86",
}

/**
 * There is no standard way on Linux to find the distribution name and version.
 * Recently, systemd has pushed to standardize the os-release file. This has
 * seen adoption in "recent" versions of all major distributions.
 * https://www.freedesktop.org/software/systemd/man/os-release.html
 */
export class LinuxDistribution {
  public constructor(public name: string, public version: string, public idLike?: string[]) {}

  public static getCurrent(): Promise<LinuxDistribution> {
    // Try /etc/os-release and fallback to /usr/lib/os-release per the synopsis
    // at https://www.freedesktop.org/software/systemd/man/os-release.html.
    return LinuxDistribution.fromFilePath("/etc/os-release")
      .catch(() => LinuxDistribution.fromFilePath("/usr/lib/os-release"))
      .catch(() => Promise.resolve(new LinuxDistribution(unknown, unknown)));
  }

  public toString(): string {
    return `name=${this.name}, version=${this.version}`;
  }

  private static fromFilePath(filePath: string): Promise<LinuxDistribution> {
    return new Promise<LinuxDistribution>((resolve, reject) => {
      fs.readFile(filePath, "utf8", (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(LinuxDistribution.fromReleaseInfo(data));
        }
      });
    });
  }

  public static fromReleaseInfo(releaseInfo: string, eol: string = os.EOL): LinuxDistribution {
    let name = unknown;
    let version = unknown;
    let idLike: string[] | undefined;

    const lines = releaseInfo.split(eol);
    for (let line of lines) {
      line = line.trim();

      let equalsIndex = line.indexOf("=");
      if (equalsIndex >= 0) {
        let key = line.substring(0, equalsIndex);
        let value = line.substring(equalsIndex + 1);

        // Strip quotes if necessary
        if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }

        if (key === "ID") {
          name = value;
        } else if (key === "VERSION_ID") {
          version = value;
        } else if (key === "ID_LIKE") {
          idLike = value.split(" ");
        }

        if (name !== unknown && version !== unknown && idLike !== undefined) {
          break;
        }
      }
    }

    return new LinuxDistribution(name, version, idLike);
  }
}

function getRuntimeIdLinux(distributionName: string, distributionVersion: string): Runtime {
  switch (distributionName) {
    case "ubuntu":
      if (distributionVersion.startsWith("14")) {
        // This also works for Linux Mint
        return Runtime.Ubuntu_14;
      } else if (distributionVersion.startsWith("16")) {
        return Runtime.Ubuntu_16;
      }

      break;
    case "elementary":
    case "elementary OS":
      if (distributionVersion.startsWith("0.3")) {
        // Elementary OS 0.3 Freya is binary compatible with Ubuntu 14.04
        return Runtime.Ubuntu_14;
      } else if (distributionVersion.startsWith("0.4")) {
        // Elementary OS 0.4 Loki is binary compatible with Ubuntu 16.04
        return Runtime.Ubuntu_16;
      }

      break;
    case "linuxmint":
      // Current versions of Linux Mint are binary compatible with Ubuntu 16.04
      return Runtime.Ubuntu_16;
    case "centos":
    case "ol":
      // Oracle Linux is binary compatible with CentOS
      return Runtime.CentOS_7;
    case "fedora":
      return Runtime.Fedora_23;
    case "opensuse":
      return Runtime.OpenSUSE_13_2;
    case "sles":
      return Runtime.SLES_12_2;
    case "rhel":
      return Runtime.RHEL_7;
    case "debian":
      return Runtime.Debian_8;
    case "galliumos":
      if (distributionVersion.startsWith("2.0")) {
        return Runtime.Ubuntu_16;
      }
      break;
    default:
      // Default to Ubuntu_16 to try to support other Linux distributions
      return Runtime.Ubuntu_16;
  }

  return Runtime.Ubuntu_16;
}

/**
 * Returns a supported .NET Core Runtime ID (RID) for the current platform. The list of Runtime IDs
 * is available at https://github.com/dotnet/corefx/tree/master/pkg/Microsoft.NETCore.Platforms.
 */
export function getRuntimeId(
  platform: string,
  architecture: string | undefined,
  distribution: LinuxDistribution | undefined
): Runtime {
  switch (platform) {
    case "win32":
      switch (architecture) {
        case "x86":
          return Runtime.Windows_86;
        case "x86_64":
          return Runtime.Windows_64;
        default:
      }

      throw new Error(`Unsupported Windows architecture: ${architecture} ${platform}`);

    case "darwin":
      if (architecture === "x86_64") {
        // Note: We return the El Capitan RID for Sierra
        return Runtime.OSX;
      }

      throw new Error(`Unsupported macOS architecture: ${architecture} ${platform}`);

    case "linux":
      if (architecture === "x86_64" && distribution) {
        // First try the distribution name
        let runtimeId = getRuntimeIdLinux(distribution.name, distribution.version);

        // If the distribution isn't one that we understand, but the 'ID_LIKE' field has something that we understand, use that
        //
        // NOTE: 'ID_LIKE' doesn't specify the version of the 'like' OS. So we will use the 'VERSION_ID' value. This will restrict
        // how useful ID_LIKE will be since it requires the version numbers to match up, but it is the best we can do.
        if (runtimeId === Runtime.Unknown && distribution.idLike && distribution.idLike.length > 0) {
          for (let id of distribution.idLike) {
            runtimeId = getRuntimeIdLinux(id, distribution.version);
            if (runtimeId !== Runtime.Unknown) {
              break;
            }
          }
        }

        if (runtimeId !== Runtime.Unknown && runtimeId !== Runtime.Unknown) {
          return runtimeId;
        }
      }

      // If we got here, this is not a Linux distro or architecture that we currently support.
      throw new Error(
        `Unsupported Linux distro: ${distribution?.name}, ${distribution?.version}, ${architecture}  ${platform}`
      );
    default:
      // If we got here, we've ended up with a platform we don't support  like 'freebsd' or 'sunos'.
      // Chances are, VS Code doesn't support these platforms either.
      throw new Error(`Unsupported platform ${platform}`);
  }
}

export function getRuntimeDisplayName(runtime: Runtime): string {
  switch (runtime) {
    case Runtime.Windows_64:
      return "Windows";
    case Runtime.Windows_86:
      return "Windows";
    case Runtime.OSX:
      return "OSX";
    case Runtime.CentOS_7:
      return "Linux";
    case Runtime.Debian_8:
      return "Linux";
    case Runtime.Fedora_23:
      return "Linux";
    case Runtime.OpenSUSE_13_2:
      return "Linux";
    case Runtime.SLES_12_2:
      return "Linux";
    case Runtime.RHEL_7:
      return "Linux";
    case Runtime.Ubuntu_14:
      return "Linux";
    case Runtime.Ubuntu_16:
      return "Linux";
    case Runtime.Linux_64:
      return "Linux";
    case Runtime.Linux_86:
      return "Linux";
    default:
      return "Unknown";
  }
}

export class PlatformInformation {
  public runtimeId: Runtime;

  public constructor(
    public platform: string,
    public architecture: string | undefined,
    public distribution: LinuxDistribution | undefined
  ) {
    this.runtimeId = getRuntimeId(platform, architecture, distribution);
  }

  public get isWindows(): boolean {
    return this.platform === "win32";
  }

  public get isMacOS(): boolean {
    return this.platform === "darwin";
  }

  public get isLinux(): boolean {
    return this.platform === "linux";
  }

  public get isValidRuntime(): boolean {
    return this.runtimeId !== undefined && this.runtimeId !== Runtime.Unknown && this.runtimeId !== Runtime.Unknown;
  }

  public get runtimeDisplayName(): string {
    return getRuntimeDisplayName(this.runtimeId);
  }

  public toString(): string {
    let result = this.platform;

    if (this.architecture) {
      if (result) {
        result += ", ";
      }

      result += this.architecture;
    }

    if (this.distribution) {
      if (result) {
        result += ", ";
      }

      result += this.distribution.toString();
    }

    return result;
  }

  public static getCurrent(): Promise<PlatformInformation> {
    let platform = os.platform();
    let architecturePromise: Promise<string | undefined>;
    let distributionPromise: Promise<LinuxDistribution | undefined>;

    switch (platform) {
      case "win32":
        architecturePromise = PlatformInformation.getWindowsArchitecture();
        distributionPromise = Promise.resolve(undefined);
        break;

      case "darwin":
        architecturePromise = PlatformInformation.getUnixArchitecture();
        distributionPromise = Promise.resolve(undefined);
        break;

      case "linux":
        architecturePromise = PlatformInformation.getUnixArchitecture();
        distributionPromise = LinuxDistribution.getCurrent();
        break;

      default:
        return Promise.reject(new Error(`Unsupported platform: ${platform}`));
    }

    return Promise.all([architecturePromise, distributionPromise]).then((rt) => {
      return new PlatformInformation(platform, rt[0], rt[1]);
    });
  }

  private static getWindowsArchitecture(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // try to get the architecture from WMIC
      PlatformInformation.getWindowsArchitectureWmic().then((wmiArch) => {
        if (wmiArch && wmiArch !== unknown) {
          resolve(wmiArch);
        } else {
          // sometimes WMIC isn't available on the path so then try to parse the envvar
          PlatformInformation.getWindowsArchitectureEnv().then((envArch) => {
            resolve(envArch);
          });
        }
      });
    });
  }

  private static getWindowsArchitectureWmic(): Promise<string> {
    return this.execChildProcess("wmic os get osarchitecture")
      .then((architecture) => {
        if (architecture) {
          let archArray: string[] = architecture.split(os.EOL);
          if (archArray.length >= 2) {
            let arch = archArray[1].trim();

            // Note: This string can be localized. So, we'll just check to see if it contains 32 or 64.
            if (arch.indexOf("64") >= 0) {
              return "x86_64";
            } else if (arch.indexOf("32") >= 0) {
              return "x86";
            }
          }
        }

        return unknown;
      })
      .catch((error) => {
        return unknown;
      });
  }

  private static getWindowsArchitectureEnv(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (process.env.PROCESSOR_ARCHITECTURE === "x86" && process.env.PROCESSOR_ARCHITEW6432 === undefined) {
        resolve("x86");
      } else {
        resolve("x86_64");
      }
    });
  }

  private static getUnixArchitecture(): Promise<string | undefined> {
    return this.execChildProcess("uname -m").then((architecture) => {
      if (architecture) {
        return architecture.trim();
      }

      return undefined;
    });
  }

  private static execChildProcess(process: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      cp.exec(process, { maxBuffer: 500 * 1024 }, (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
          return;
        }

        if (stderr && stderr.length > 0) {
          reject(new Error(stderr));
          return;
        }

        resolve(stdout);
      });
    });
  }
}
