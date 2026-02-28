import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const APPLE_SCRIPT_RUN_JSX = `on run argv
  set jsxPath to item 1 of argv
  tell application id "com.adobe.Photoshop"
    activate
    do javascript file jsxPath
  end tell
end run`;

export interface RenderPosterIntoPsdOptions {
  psdPath: string;
  posterPath: string;
  outputPath: string;
  smartObjectLayerName?: string;
}

const escapeForJsx = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown Photoshop execution error';
};

const assertPhotoshopAvailable = async (): Promise<void> => {
  try {
    await execFileAsync('osascript', [
      '-e',
      'application id "com.adobe.Photoshop" version',
    ]);
  } catch {
    throw new Error(
      'Adobe Photoshop ble ikke funnet. For PSD smart-object rendering maa Photoshop vaere installert paa maskinen.'
    );
  }
};

const buildJsxScript = (
  psdPath: string,
  posterPath: string,
  outputPath: string,
  smartObjectLayerName?: string
): string => {
  const safePsdPath = escapeForJsx(psdPath);
  const safePosterPath = escapeForJsx(posterPath);
  const safeOutputPath = escapeForJsx(outputPath);
  const safeLayerName = escapeForJsx(smartObjectLayerName ?? '');

  return `#target photoshop
app.displayDialogs = DialogModes.NO;

function findSmartObjectLayer(container, preferredName) {
  var i;

  for (i = 0; i < container.artLayers.length; i++) {
    var artLayer = container.artLayers[i];
    if (artLayer.kind == LayerKind.SMARTOBJECT) {
      if (!preferredName || artLayer.name == preferredName) {
        return artLayer;
      }
    }
  }

  for (i = 0; i < container.layerSets.length; i++) {
    var nested = findSmartObjectLayer(container.layerSets[i], preferredName);
    if (nested) {
      return nested;
    }
  }

  return null;
}

var psdFile = new File("${safePsdPath}");
var posterFile = new File("${safePosterPath}");
var outputFile = new File("${safeOutputPath}");
var preferredLayerName = "${safeLayerName}";

if (!psdFile.exists) {
  throw new Error("PSD file not found: ${safePsdPath}");
}

if (!posterFile.exists) {
  throw new Error("Poster file not found: ${safePosterPath}");
}

var doc = app.open(psdFile);
var targetLayer = findSmartObjectLayer(doc, preferredLayerName);

if (!targetLayer && preferredLayerName !== "") {
  targetLayer = findSmartObjectLayer(doc, "");
}

if (!targetLayer) {
  doc.close(SaveOptions.DONOTSAVECHANGES);
  throw new Error("No smart object layer found in PSD.");
}

app.activeDocument = doc;
doc.activeLayer = targetLayer;

var idplacedLayerReplaceContents = stringIDToTypeID("placedLayerReplaceContents");
var descriptor = new ActionDescriptor();
descriptor.putPath(charIDToTypeID("null"), posterFile);
executeAction(idplacedLayerReplaceContents, descriptor, DialogModes.NO);

var exportOptions = new ExportOptionsSaveForWeb();
exportOptions.format = SaveDocumentType.PNG;
exportOptions.PNG8 = false;
exportOptions.transparency = true;
exportOptions.interlaced = false;
exportOptions.quality = 100;

doc.exportDocument(outputFile, ExportType.SAVEFORWEB, exportOptions);
doc.close(SaveOptions.DONOTSAVECHANGES);
`;
};

export const renderPosterIntoPsd = async (
  options: RenderPosterIntoPsdOptions
): Promise<void> => {
  const absolutePsdPath = path.resolve(options.psdPath);
  const absolutePosterPath = path.resolve(options.posterPath);
  const absoluteOutputPath = path.resolve(options.outputPath);

  await assertPhotoshopAvailable();
  await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vhs-psd-render-'));
  const jsxPath = path.join(tempDir, 'render.jsx');

  try {
    const jsxScript = buildJsxScript(
      absolutePsdPath,
      absolutePosterPath,
      absoluteOutputPath,
      options.smartObjectLayerName
    );

    await fs.writeFile(jsxPath, jsxScript, 'utf8');

    await execFileAsync('osascript', ['-e', APPLE_SCRIPT_RUN_JSX, jsxPath], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`Photoshop PSD render feilet: ${getErrorMessage(error)}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
