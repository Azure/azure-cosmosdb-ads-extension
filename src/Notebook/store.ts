import { AppState, epics as coreEpics, reducers } from "@nteract/core";
import { configuration } from "@nteract/mythic-configuration";
import { makeConfigureStore } from "@nteract/myths";
import { compose, Store } from "redux";
import { contents } from "rx-jupyter";

// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// const composeEnhancers = (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const configureStore = (initialState: AppState): Store<any> => {
  const mythConfigureStore = makeConfigureStore<AppState>()({
    packages: [configuration],
    reducers: {
      app: reducers.app,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      core: reducers.core as any,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    epics: coreEpics.allEpics as any,
    epicDependencies: { contentProvider: contents.JupyterContentProvider },
    enhancer: composeEnhancers,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mythConfigureStore(initialState) as any;
};

export default configureStore;
