// Vendor modules
import { monocellNotebook, toJS } from "@nteract/commutable";
import {
  actions,
  AppState,
  CommsRecordProps,
  createContentRef,
  createHostRef,
  createKernelspecsRef,
  makeAppRecord,
  makeCommsRecord,
  makeContentsRecord,
  makeDummyContentRecord,
  makeEntitiesRecord,
  makeHostsRecord,
  makeJupyterHostRecord,
  makeStateRecord,
  makeTransformsRecord,
} from "@nteract/core";
import { configOption } from "@nteract/mythic-configuration";
// import { Media } from "@nteract/outputs";
// import TransformVDOM from "@nteract/transform-vdom";
import { ContentRecord, createKernelRef, HostRecord } from "@nteract/types";
import * as Immutable from "immutable";
import configureStore from "./store";

// Taken from nteract jupyter-extension app
export async function main(): Promise<void> {
  const jupyterHostRecord = makeJupyterHostRecord({
    id: null,
    type: "jupyter",
    defaultKernelName: "python",
    token: "1234",
    origin: undefined, //location.origin,
    basePath: undefined,
    bookstoreEnabled: false,
    showHeaderEditor: false,
  });

  const hostRef = createHostRef();
  const contentRef = createContentRef();
  const NullTransform = (): unknown => null;
  const kernelspecsRef = createKernelspecsRef();
  const kernelRef = createKernelRef();

  const initialState: AppState & { comms: CommsRecordProps; config: Immutable.Map<string, string> } = {
    app: makeAppRecord({
      version: "nbClient 1.0.0",
      host: jupyterHostRecord,
    }),
    comms: makeCommsRecord(),
    config: Immutable.Map({
      theme: "light",
    }),
    core: makeStateRecord({
      currentKernelspecsRef: kernelspecsRef,
      entities: makeEntitiesRecord({
        hosts: makeHostsRecord({
          byRef: Immutable.Map<string, HostRecord>().set(hostRef, jupyterHostRecord),
        }),
        contents: makeContentsRecord({
          byRef: Immutable.Map<string, ContentRecord>().set(
            contentRef,
            makeDummyContentRecord({
              filepath: undefined, // TODO Fix this?
            })
          ),
        }),
        transforms: makeTransformsRecord({
          displayOrder: Immutable.List([
            // "application/vnd.jupyter.widget-view+json",
            // "application/vnd.vega.v5+json",
            // "application/vnd.vega.v4+json",
            // "application/vnd.vega.v3+json",
            // "application/vnd.vega.v2+json",
            // "application/vnd.vegalite.v3+json",
            // "application/vnd.vegalite.v2+json",
            // "application/vnd.vegalite.v1+json",
            // "application/geo+json",
            // "application/vnd.plotly.v1+json",
            // "text/vnd.plotly.v1+html",
            // "application/x-nteract-model-debug+json",
            // "application/vnd.dataresource+json",
            // "application/vdom.v1+json",
            // "application/json",
            // "application/javascript",
            // "text/html",
            // "text/markdown",
            // "text/latex",
            // "image/svg+xml",
            // "image/gif",
            // "image/png",
            // "image/jpeg",
            // "text/plain",
          ]),
          byId: Immutable.Map({
            // "text/vnd.plotly.v1+html": NullTransform,
            // "application/vnd.plotly.v1+json": NullTransform,
            // "application/geo+json": NullTransform,
            // "application/x-nteract-model-debug+json": NullTransform,
            // "application/vnd.dataresource+json": NullTransform,
            // "application/vnd.jupyter.widget-view+json": NullTransform,
            // "application/vnd.vegalite.v1+json": NullTransform,
            // "application/vnd.vegalite.v2+json": NullTransform,
            // "application/vnd.vegalite.v3+json": NullTransform,
            // "application/vnd.vega.v2+json": NullTransform,
            // "application/vnd.vega.v3+json": NullTransform,
            // "application/vnd.vega.v4+json": NullTransform,
            // "application/vnd.vega.v5+json": NullTransform,
            // "application/vdom.v1+json": TransformVDOM,
            // "application/json": Media.Json,
            // "application/javascript": Media.JavaScript,
            // "text/html": Media.HTML,
            // "text/markdown": Media.Markdown,
            // "text/latex": Media.LaTeX,
            // "image/svg+xml": Media.SVG,
            // "image/gif": Media.Image,
            // "image/png": Media.Image,
            // "image/jpeg": Media.Image,
            // "text/plain": Media.Plain,
          }),
        }),
      }),
    }),
  };

  // const kernelRef = createKernelRef();

  // TODO Setup backend
  // const url = "https://localhost:44329/api/bind";
  // const url = "https://localhost:44329/api/bind";
  // const url = `https://${location.hostname}:5001/api/bind`;
  // const url = `${location.origin}:5001/api/bind`;
  const url = `https://localhost:5001/api/bind`;
  // const response = await window.fetch(, {

  const response = await window.fetch(url, {
    method: "POST",
    body: JSON.stringify({
      id: "id",
      cosmosEndpoint: "sdf",
      dbAccountName: "sdf",
      port: "sdf",
      aadToken:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      subscriptionId: "sdf",
      resourceGroup: "dfg",
      sessionToken: "1234",
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  // eslint-disable-next-line no-console
  // console.log("bind call", response);

  const store = configureStore(initialState);
  // (window as any).store = store;

  store.dispatch(actions.fetchKernelspecs({ hostRef, kernelspecsRef }));

  // Disable auto-save since this is not backed by a physical notebook file
  // TODO: FIX this doesn't seem to work
  store.dispatch(configOption("autoSaveInterval").action(365 * 24 * 3600 * 1000));

  const notebookMediaType = "application/x-ipynb+json";
  const filepath = "/";
  const timestamp = new Date();
  const name = "notebook";
  const spec = {
    name: "echo",
    spec: {
      display_name: "Echo",
      language: "echo",
      argv: [] as string[],
    },
  };

  const notebook = monocellNotebook
    .setIn(["metadata", "kernel_info", "name"], name)
    .setIn(["metadata", "language_info", "name"], name)
    .setIn(["metadata", "kernelspec"], spec)
    .setIn(["metadata", "kernelspec", "name"], spec.name);

  store.dispatch(
    actions.fetchContentFulfilled({
      filepath,
      model: {
        type: "notebook",
        mimetype: notebookMediaType,
        format: "json",
        // Back to JS, only to immutableify it inside of the reducer
        content: toJS(notebook),
        writable: true,
        name,
        path: filepath,
        created: timestamp.toString(),
        last_modified: timestamp.toString(),
      },
      kernelRef,
      contentRef,
    })
  );

  // store.dispatch(actions.createCellAppend({ cellType: "code", contentRef }));

  // // Request fetching notebook content
  // this.getStore().dispatch(
  //   actions.fetchContent({
  //     filepath: "mongo.ipynb",
  //     params: {},
  //     kernelRef: this.kernelRef,
  //     contentRef: this.contentRef
  //   })
  // );

  const props = {
    contentRef,
    kernelRef: createKernelRef(),
    databaseId: "familiesdb",
    collectionId: "families",
  };

}
