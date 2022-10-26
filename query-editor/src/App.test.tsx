import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App
    databaseName="databaseName"
    collectionName="collectionName"
    connectionId="connectionId"
    onSubmitQuery={() => {}}  />);
  const linkElement = screen.getByText(/Query is/i);
  expect(linkElement).toBeInTheDocument();
});
