import React from "react";
import { logError } from "../lib/errorLog";

// Fanger UVENTEDE render-fejl (crashes) i hele komponenttræet under den -
// se main.jsx, hvor hele appen pakkes ind i denne. Uden en Error Boundary
// ville en enkelt uventet fejl et sted i træet vise en helt BLANK, hvid
// skærm, uden nogen forklaring - meget forvirrende for en bruger midt i
// arbejdet. Denne fanger fejlen, logger den (se lib/errorLog.js), og viser
// i stedet en forklarende besked med mulighed for at genindlæse.
//
// Skal være en class-komponent - React understøtter (endnu) ikke error
// boundaries som function-komponenter med hooks.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logError("react-error-boundary", error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-paper px-4">
          <div className="max-w-sm rounded-xl border border-line bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-ink mb-3">Der opstod en uventet fejl. Fejlen er registreret automatisk.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm font-semibold uppercase tracking-wide text-white bg-ink hover:bg-brand transition-colors"
            >
              Genindlæs siden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
