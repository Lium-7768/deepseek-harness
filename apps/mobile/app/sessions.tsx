import { Redirect } from 'expo-router'

/** Keeps the legacy route addressable without creating a second drawer owner. */
export default function SessionsScreen(): React.JSX.Element {
  return <Redirect href="/workspace" />
}
