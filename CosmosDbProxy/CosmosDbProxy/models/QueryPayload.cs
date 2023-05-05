﻿using Newtonsoft.Json;
using System.Text.Json.Serialization;

namespace Microsoft.Azure.Cosmos.AdsExtensionProxy.DataModel
{
    public sealed class QueryPayload
    {
        [JsonProperty("databaseId")]
        public string DatabaseId { get; set; }

        [JsonProperty("containerId")]
        public string ContainerId { get; set; }

        [JsonProperty("queryText")]
        public string QueryText { get; set; }

        [JsonProperty("continuationToken")]
        public string ContinuationToken { get; set; }

        [JsonProperty("maxCount")]
        public int MaxCount { get; set; }
    }
}