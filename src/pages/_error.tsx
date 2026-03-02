import type { NextPageContext } from 'next';
import type { ErrorProps } from 'next/error';
import Error from 'next/error';

const CustomError = ({ statusCode }: ErrorProps) => (
  <Error statusCode={statusCode} title="Noe gikk galt i appen." />
);

CustomError.getInitialProps = ({ res, err }: NextPageContext): ErrorProps => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default CustomError;
