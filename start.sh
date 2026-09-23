#!/bin/sh

# Calculate available memory
available_memory=$(awk '/MemTotal/{printf "%.0f\n", $2/1024;}' /proc/meminfo)
echo "Available memory: ${available_memory}MB"

# Calculate available CPU cores
available_cpu=$(grep -c '^processor' /proc/cpuinfo)
echo "Available CPU: ${available_cpu} cores"

# Set the maximum number of instances based on available memory 
if [ "${available_memory}" -gt 1024 ]; then
  max_instances=$available_cpu
else
  max_instances=1
fi
echo "Instances in cluster: ${max_instances}"

# Start PM2 with the calculated maximum instances
pm2-runtime start index.js --name application --no-auto-exit --instances $max_instances --output /dev/null --error /dev/null