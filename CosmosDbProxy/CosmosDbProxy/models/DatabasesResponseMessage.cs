using Newtonsoft.Json;
using System.Collections.ObjectModel;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class DatabaseResponseMessage
    {
        [JsonProperty("databases")]
        public Collection<DatabaseInfo>? Databases { get; set; }
    }

    public sealed class DatabaseInfo
    {
        [JsonProperty("id")]
        public string? Id { get; set; }
    }
}